package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
)

func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		log.Fatalf("ping database: %v", err)
	}

	migrationsDir, err := resolveMigrationsDir()
	if err != nil {
		log.Fatalf("resolve migrations dir: %v", err)
	}

	if err := ensureMigrationsTable(context.Background(), db); err != nil {
		log.Fatalf("ensure schema_migrations: %v", err)
	}

	files, err := migrationFiles(migrationsDir)
	if err != nil {
		log.Fatalf("load migrations: %v", err)
	}

	for _, file := range files {
		applied, err := migrationApplied(context.Background(), db, file)
		if err != nil {
			log.Fatalf("check migration %s: %v", file, err)
		}
		if applied {
			continue
		}

		if err := applyMigration(context.Background(), db, filepath.Join(migrationsDir, file), file); err != nil {
			log.Fatalf("apply migration %s: %v", file, err)
		}
		log.Printf("applied migration %s", file)
	}
}

func resolveMigrationsDir() (string, error) {
	if explicit := os.Getenv("MIGRATIONS_DIR"); explicit != "" {
		return explicit, nil
	}

	candidates := []string{
		"/app/db/migrations",
		"db/migrations",
		"../../db/migrations",
	}

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
	}

	return "", errors.New("could not find migrations directory")
}

func ensureMigrationsTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
		  version TEXT PRIMARY KEY,
		  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func migrationFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	files := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if filepath.Ext(entry.Name()) == ".sql" {
			files = append(files, entry.Name())
		}
	}

	sort.Strings(files)
	return files, nil
}

func migrationApplied(ctx context.Context, db *sql.DB, version string) (bool, error) {
	var exists bool
	err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&exists)
	return exists, err
}

func applyMigration(ctx context.Context, db *sql.DB, path, version string) error {
	migration, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, string(migration)); err != nil {
		return fmt.Errorf("execute sql: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	return tx.Commit()
}
