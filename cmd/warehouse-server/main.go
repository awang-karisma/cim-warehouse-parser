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
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/accurate"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/adapter"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/provider/official"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/provider/web"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/session"
	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

func main() {
	// 1. Initialize configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	if cfg.GoogleClientID != "" && !slices.ContainsFunc(strings.Split(cfg.SuperadminEmails, ","), func(email string) bool {
		return strings.TrimSpace(email) != ""
	}) {
		log.Fatal("SUPERADMIN_EMAILS must include a recovery account when authentication is enabled")
	}

	telemetryProvider, err := telemetry.Setup(context.Background(), cfg.TelemetryConfig())
	if err != nil {
		log.Fatalf("failed to initialize telemetry: %v", err)
	}
	if telemetryProvider.Enabled() {
		log.Printf("PostHog OTLP logging enabled (service: %s, env: %s, level: %s)", cfg.PostHogServiceName, cfg.PostHogEnvironment, cfg.PostHogLogLevel)
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

	// 5. Initialize Accurate integration (if configured)
	var accProv accurate.Provider
	var accSession *session.Manager
	var accRegistry *adapter.Registry

	switch accurate.ProviderKind(cfg.AccurateProvider) {
	case accurate.ProviderWeb:
		accProv = web.New(cfg.AccurateEmail, cfg.AccuratePassword, nil)
		accSession = session.NewManager(store, accProv)
		accRegistry = adapter.NewRegistry(accProv)
		log.Printf("Accurate integration initialized with provider: web (%s)", cfg.AccurateEmail)
	case accurate.ProviderOfficial:
		var opts []official.Option
		if cfg.AccurateAPISignatureSecret != "" {
			opts = append(opts, official.WithSignatureSecret(cfg.AccurateAPISignatureSecret))
		}
		accProv = official.New(cfg.AccurateAPIToken, opts...)
		accSession = session.NewManager(store, accProv)
		accRegistry = adapter.NewRegistry(accProv)
		log.Println("Accurate integration initialized with provider: official")
	default:
		log.Println("Accurate integration is disabled (ACCURATE_PROVIDER is unset)")
	}

	// 6. Start Fiber v3 HTTP server
	srv := api.New(api.Config{
		Store:            store,
		Worker:           w,
		AppConfig:        cfg,
		AccurateProvider: accProv,
		AccurateSession:  accSession,
		AccurateRegistry: accRegistry,
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
		telemetry.Emit(context.Background(), telemetry.Event{
			Name:     "server.started",
			Severity: otellog.SeverityInfo,
			Body:     "Warehouse HTTP server started",
			Attributes: []attribute.KeyValue{
				attribute.String("server.port", cfg.Port),
				attribute.String("accurate.provider", cfg.AccurateProvider),
				attribute.Bool("auth.enabled", cfg.GoogleClientID != ""),
			},
		})
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
		telemetry.Emit(context.Background(), telemetry.Event{
			Name:     "server.listen_error",
			Severity: otellog.SeverityError,
			Body:     "HTTP server listen error",
			Err:      err,
			Attributes: []attribute.KeyValue{
				attribute.String("server.port", cfg.Port),
				attribute.String("error.message", err.Error()),
			},
		})
		errFlushCtx, errFlushCancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = telemetryProvider.Shutdown(errFlushCtx)
		errFlushCancel()
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
	telemetry.Emit(context.Background(), telemetry.Event{
		Name:     "server.stopped",
		Severity: otellog.SeverityInfo,
		Body:     "Warehouse HTTP server stopped gracefully",
	})
	if err := telemetryProvider.Shutdown(shutdownCtx); err != nil {
		log.Printf("warning: telemetry shutdown error: %v", err)
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
			return worker.NewSheetsFetcher(svc, cfg.SpreadsheetID, cfg.SheetName).WithPOSheetName(cfg.POSheetName)
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
			return worker.NewSheetsFetcher(svc, cfg.SpreadsheetID, cfg.SheetName).WithPOSheetName(cfg.POSheetName)
		}
		log.Printf("warning: failed to initialize Google Sheets service with API Key: %v. Falling back to CSV", err)
	}

	log.Printf("Using CSV fallback fetcher from: %s", cfg.CSVFallbackPath)
	return worker.NewCSVFetcher(cfg.CSVFallbackPath)
}
