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

	// 4. Initialize worker
	w, err := worker.New(cfg.WorkerConfig(), store, fetcher)
	if err != nil {
		log.Fatalf("failed to initialize worker: %v", err)
	}

	// 5. Start Fiber v3 HTTP server
	srv := api.New(api.Config{
		Store:     store,
		Worker:    w,
		AppConfig: cfg,
	})

	if embeddedFS != nil {
		log.Println("Serving embedded SolidJS frontend")
		srv.SetupStaticFS(embeddedFS)
	} else {
		distPath := "web/dist"
		if info, err := os.Stat(distPath); err == nil && info.IsDir() {
			log.Printf("Serving SolidJS frontend from %s", distPath)
			srv.SetupStaticFiles(distPath)
		}
	}

	app := srv.App()

	serverErrors := make(chan error, 1)
	addr := ":" + cfg.Port
	go func() {
		log.Printf("Starting HTTP server listening on %s (Scalar Docs: http://localhost:%s/docs, OpenAPI: http://localhost:%s/openapi.json)", addr, cfg.Port, cfg.Port)
		if err := app.Listen(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	// 6. Start sync worker in background (initial sync and periodic loop)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Println("Starting background sync worker...")
	go w.Start(ctx)

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

	hasCreds := false
	if credsPath != "" {
		if info, err := os.Stat(credsPath); err == nil && !info.IsDir() {
			hasCreds = true
		} else {
			log.Printf("warning: Google credentials file (%s) does not exist or is invalid", credsPath)
		}
	}

	if hasCreds {
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
	} else if cfg.GoogleAPIKey != "" || os.Getenv("GOOGLE_API_KEY") != "" {
		apiKey := cfg.GoogleAPIKey
		if apiKey == "" {
			apiKey = os.Getenv("GOOGLE_API_KEY")
		}
		svc, err := sheets.NewService(context.Background(), option.WithAPIKey(apiKey))
		if err == nil {
			log.Printf("Using Google Sheets fetcher with API Key for spreadsheet ID %s, sheet %s", cfg.SpreadsheetID, cfg.SheetName)
			return worker.NewSheetsFetcher(svc, cfg.SpreadsheetID, cfg.SheetName)
		}
		log.Printf("warning: failed to initialize Google Sheets service with API Key: %v. Falling back to CSV", err)
	}

	log.Printf("Using CSV fallback fetcher from: %s", cfg.CSVFallbackPath)
	return worker.NewCSVFetcher(cfg.CSVFallbackPath)
}
