// Package main is the entrypoint for the warehouse-server application.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	_ "github.com/awang-karisma/warehouse-parser/docs"
	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

func main() {
	// 1. Initialize configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	// 2. Ensure DB directory exists and initialize SQLite storage
	dbDir := filepath.Dir(cfg.DBPath)
	if dbDir != "" && dbDir != "." {
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			log.Fatalf("failed to create database directory %s: %v", dbDir, err)
		}
	}

	store, err := storage.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("failed to initialize database at %s: %v", cfg.DBPath, err)
	}
	defer store.Close()

	// 3. Initialize fetcher (Sheets or CSV fallback)
	fetcher := initFetcher(cfg)

	// 4. Initialize and start worker
	w, err := worker.New(cfg.WorkerConfig(), store, fetcher)
	if err != nil {
		log.Fatalf("failed to initialize worker: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go w.Start(ctx)

	// 5. Run initial sync on startup
	log.Println("Running initial sync on startup...")
	if err := w.RunOnce(ctx, true); err != nil {
		log.Printf("warning: initial sync encountered error: %v", err)
	} else {
		log.Println("Initial sync completed successfully.")
	}

	// 6. Start Fiber v3 HTTP server
	srv := api.New(api.Config{
		Store:  store,
		Worker: w,
	})
	app := srv.App()

	serverErrors := make(chan error, 1)
	addr := ":" + cfg.Port
	go func() {
		log.Printf("Starting HTTP server listening on %s (Swagger: http://localhost:%s/swagger)", addr, cfg.Port)
		if err := app.Listen(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	// 7. Handle graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		log.Fatalf("HTTP server listen error: %v", err)
	case sig := <-quit:
		log.Printf("Received shutdown signal %v, terminating gracefully...", sig)
	}

	cancel() // terminate background worker

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Printf("warning: server shutdown error: %v", err)
	}
	if err := store.Close(); err != nil {
		log.Printf("warning: storage close error: %v", err)
	}
	log.Println("Server gracefully stopped.")
}

func initFetcher(cfg *config.Config) worker.Fetcher {
	credsPath := cfg.GoogleApplicationCredentials
	if credsPath == "" {
		credsPath = os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	}

	if credsPath != "" {
		if info, err := os.Stat(credsPath); err == nil && !info.IsDir() {
			ctx := context.Background()
			svc, err := sheets.NewService(ctx,
				option.WithCredentialsFile(credsPath),
				option.WithScopes(sheets.SpreadsheetsReadonlyScope),
			)
			if err == nil {
				log.Printf("Using Google Sheets fetcher with spreadsheet ID %s, sheet %s",
					cfg.SpreadsheetID, cfg.SheetName)
				return worker.NewSheetsFetcher(svc, cfg.SpreadsheetID, cfg.SheetName)
			}
			log.Printf("warning: failed to initialize Google Sheets service from credentials (%s): %v. Falling back to CSV", credsPath, err)
		} else {
			log.Printf("warning: Google credentials file (%s) does not exist or is invalid. Falling back to CSV", credsPath)
		}
	}

	log.Printf("Using CSV fallback fetcher from: %s", cfg.CSVFallbackPath)
	return worker.NewCSVFetcher(cfg.CSVFallbackPath)
}
