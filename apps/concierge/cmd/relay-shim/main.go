package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/relayshim"
)

func main() {
	endpoint := os.Getenv("CONCIERGE_RELAY_AUTH_URL")
	if endpoint == "" {
		endpoint = "http://127.0.0.1:3000/internal/relay/authorize"
	}

	processor := relayshim.NewProcessor(endpoint, nil)
	scanner := bufio.NewScanner(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	for scanner.Scan() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		output, err := processor.ProcessLine(ctx, scanner.Bytes())
		cancel()
		if err != nil {
			log.Printf("relay shim: %v", err)
			continue
		}
		if len(output) == 0 {
			continue
		}
		if _, err := writer.Write(output); err != nil {
			log.Fatalf("write shim output: %v", err)
		}
		if err := writer.Flush(); err != nil {
			log.Fatalf("flush shim output: %v", err)
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "relay shim scan error: %v\n", err)
		os.Exit(1)
	}
}
