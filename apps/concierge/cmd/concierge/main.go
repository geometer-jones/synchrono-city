package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/httpapi"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

const (
	readTimeout     = 5 * time.Second
	writeTimeout    = 15 * time.Second
	idleTimeout     = 60 * time.Second
	shutdownTimeout = 30 * time.Second
)

func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	policyStore, err := store.NewPostgres(context.Background(), cfg.DatabaseURL, store.PostgresOptions{
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
	})
	if err != nil {
		log.Fatalf("connect store: %v", err)
	}
	defer func() {
		if err := policyStore.Close(); err != nil {
			log.Printf("close store: %v", err)
		}
	}()

	server := httpapi.NewServer(cfg, policyStore)
	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      server.Handler(),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("concierge listening on :%s for relay %s", cfg.Port, cfg.RelayName)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	signalCh := make(chan os.Signal, 1)
	signal.Notify(signalCh, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signalCh)

	select {
	case err := <-errCh:
		log.Fatalf("serve concierge: %v", err)
	case sig := <-signalCh:
		log.Printf("shutting down concierge on signal %s", sig)
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := httpServer.Shutdown(ctx); err != nil {
			log.Fatalf("shutdown concierge: %v", err)
		}
	}
}
