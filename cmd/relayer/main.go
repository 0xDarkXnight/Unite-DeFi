package main

import (
	"context"
	"log"
	"os/signal"
	"sync"
	"syscall"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/relayer"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load configuration:", err)
	}

	// Setup graceful shutdown
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Create and start relayer
	r, err := relayer.New(cfg)
	if err != nil {
		log.Fatal("Failed to create relayer:", err)
	}

	var wg sync.WaitGroup
	wg.Add(1)

	go func() {
		defer wg.Done()
		if err := r.Start(ctx); err != nil {
			log.Printf("Relayer error: %v", err)
		}
	}()

	log.Println("Fusion+ Relayer started successfully")

	// Wait for shutdown signal
	<-ctx.Done()
	log.Println("Shutdown signal received, stopping relayer...")

	// Stop relayer
	r.Stop()

	// Wait for goroutines to finish
	wg.Wait()
	log.Println("Relayer stopped successfully")
}
