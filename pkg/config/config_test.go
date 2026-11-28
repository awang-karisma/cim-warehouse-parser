package config_test

import (
	"os"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/config"
)

func TestDefaultConfig(t *testing.T) {
	// Clear any environment variables that might interfere
	envKeys := []string{
		"SERVER_PORT", "PORT", "DB_PATH", "SYNC_INTERVAL",
		"SYNC_WORK_HOURS_START", "SYNC_WORK_HOURS_END", "SYNC_TIMEZONE",
		"SPREADSHEET_ID", "SHEET_NAME", "GOOGLE_APPLICATION_CREDENTIALS",
		"GOOGLE_API_KEY", "CSV_FALLBACK_PATH", "SYNC_BYPASS_WORK_HOURS_ON_FIRST_SYNC",
		"GOOGLE_CLIENT_ID", "JWT_SECRET", "SUPERADMIN_EMAILS",
		"POSTHOG_API_KEY", "VITE_POSTHOG_KEY", "POSTHOG_HOST", "VITE_POSTHOG_HOST",
		"POSTHOG_SERVICE_NAME", "OTEL_SERVICE_NAME", "POSTHOG_ENVIRONMENT", "APP_ENV",
		"POSTHOG_LOG_LEVEL",
	}
	for _, k := range envKeys {
		oldVal, exists := os.LookupEnv(k)
		if exists {
			os.Unsetenv(k)
			defer os.Setenv(k, oldVal)
		}
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error loading defaults: %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("expected Port=8080, got %s", cfg.Port)
	}
	if cfg.DBPath != "data/warehouse.db" {
		t.Errorf("expected DBPath=data/warehouse.db, got %s", cfg.DBPath)
	}
	if cfg.SyncInterval != 15*time.Minute {
		t.Errorf("expected SyncInterval=15m, got %v", cfg.SyncInterval)
	}
	if cfg.WorkHoursStart != "08:00" {
		t.Errorf("expected WorkHoursStart=08:00, got %s", cfg.WorkHoursStart)
	}
	if cfg.WorkHoursEnd != "17:00" {
		t.Errorf("expected WorkHoursEnd=17:00, got %s", cfg.WorkHoursEnd)
	}
	if cfg.Timezone != "Asia/Makassar" {
		t.Errorf("expected Timezone=Asia/Makassar, got %s", cfg.Timezone)
	}
	if cfg.SpreadsheetID != "1X3FqpqpP7utvkyFK98YE863ItVsvmmUrBTBsGfuzK3s" {
		t.Errorf("expected SpreadsheetID default, got %s", cfg.SpreadsheetID)
	}
	if cfg.SheetName != "PESANAN" {
		t.Errorf("expected SheetName=PESANAN, got %s", cfg.SheetName)
	}
	if cfg.CSVFallbackPath != "testdata/orders_sample.csv" {
		t.Errorf("expected CSVFallbackPath=testdata/orders_sample.csv, got %s", cfg.CSVFallbackPath)
	}
	if cfg.GoogleAPIKey != "" {
		t.Errorf("expected GoogleAPIKey default to be empty, got %s", cfg.GoogleAPIKey)
	}
	if !cfg.SyncBypassWorkHoursOnFirstSync {
		t.Errorf("expected SyncBypassWorkHoursOnFirstSync=true by default, got %v", cfg.SyncBypassWorkHoursOnFirstSync)
	}
	wCfgDefault := cfg.WorkerConfig()
	if wCfgDefault.BypassWorkHoursOnFirstSync == nil || !*wCfgDefault.BypassWorkHoursOnFirstSync {
		t.Errorf("expected WorkerConfig BypassWorkHoursOnFirstSync to be true")
	}
	if cfg.GoogleClientID != "" {
		t.Errorf("expected GoogleClientID default to be empty, got %s", cfg.GoogleClientID)
	}
	if len(cfg.JWTSecret) != 64 {
		t.Errorf("expected generated JWTSecret of length 64 hex characters, got %s", cfg.JWTSecret)
	}
	if cfg.SuperadminEmails != "" {
		t.Errorf("expected SuperadminEmails default to be empty, got %s", cfg.SuperadminEmails)
	}
	if cfg.IsSuperadmin("admin@example.com") {
		t.Errorf("expected IsSuperadmin to be false by default")
	}
	if cfg.PostHogAPIKey != "" {
		t.Errorf("expected PostHogAPIKey default to be empty, got %q", cfg.PostHogAPIKey)
	}
	if cfg.PostHogHost != "https://us.i.posthog.com" {
		t.Errorf("expected PostHogHost default, got %q", cfg.PostHogHost)
	}
	if cfg.PostHogServiceName != "warehouse-parser-api" {
		t.Errorf("expected PostHogServiceName default, got %q", cfg.PostHogServiceName)
	}
	if cfg.PostHogEnvironment != "production" {
		t.Errorf("expected PostHogEnvironment default, got %q", cfg.PostHogEnvironment)
	}
	if cfg.PostHogLogLevel != "info" {
		t.Errorf("expected PostHogLogLevel default, got %q", cfg.PostHogLogLevel)
	}
}

func TestEnvOverrides(t *testing.T) {
	t.Setenv("SERVER_PORT", "9999")
	t.Setenv("DB_PATH", "custom/path.db")
	t.Setenv("SYNC_INTERVAL", "45m")
	t.Setenv("SYNC_WORK_HOURS_START", "07:30")
	t.Setenv("SYNC_WORK_HOURS_END", "18:30")
	t.Setenv("SYNC_TIMEZONE", "Asia/Jakarta")
	t.Setenv("SPREADSHEET_ID", "custom-sheet-id")
	t.Setenv("SHEET_NAME", "CUSTOM_SHEET")
	t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", "/path/to/creds.json")
	t.Setenv("GOOGLE_API_KEY", "AIzaSyFakeKey123")
	t.Setenv("CSV_FALLBACK_PATH", "custom/sample.csv")
	t.Setenv("SYNC_BYPASS_WORK_HOURS_ON_FIRST_SYNC", "false")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error loading overridden config: %v", err)
	}

	if cfg.Port != "9999" {
		t.Errorf("expected Port=9999, got %s", cfg.Port)
	}
	if cfg.DBPath != "custom/path.db" {
		t.Errorf("expected DBPath=custom/path.db, got %s", cfg.DBPath)
	}
	if cfg.SyncInterval != 45*time.Minute {
		t.Errorf("expected SyncInterval=45m, got %v", cfg.SyncInterval)
	}
	if cfg.WorkHoursStart != "07:30" {
		t.Errorf("expected WorkHoursStart=07:30, got %s", cfg.WorkHoursStart)
	}
	if cfg.WorkHoursEnd != "18:30" {
		t.Errorf("expected WorkHoursEnd=18:30, got %s", cfg.WorkHoursEnd)
	}
	if cfg.Timezone != "Asia/Jakarta" {
		t.Errorf("expected Timezone=Asia/Jakarta, got %s", cfg.Timezone)
	}
	if cfg.SpreadsheetID != "custom-sheet-id" {
		t.Errorf("expected SpreadsheetID=custom-sheet-id, got %s", cfg.SpreadsheetID)
	}
	if cfg.SheetName != "CUSTOM_SHEET" {
		t.Errorf("expected SheetName=CUSTOM_SHEET, got %s", cfg.SheetName)
	}
	if cfg.GoogleApplicationCredentials != "/path/to/creds.json" {
		t.Errorf("expected GoogleApplicationCredentials=/path/to/creds.json, got %s", cfg.GoogleApplicationCredentials)
	}
	if cfg.GoogleAPIKey != "AIzaSyFakeKey123" {
		t.Errorf("expected GoogleAPIKey=AIzaSyFakeKey123, got %s", cfg.GoogleAPIKey)
	}
	if cfg.CSVFallbackPath != "custom/sample.csv" {
		t.Errorf("expected CSVFallbackPath=custom/sample.csv, got %s", cfg.CSVFallbackPath)
	}
	if cfg.SyncBypassWorkHoursOnFirstSync != false {
		t.Errorf("expected SyncBypassWorkHoursOnFirstSync=false, got %v", cfg.SyncBypassWorkHoursOnFirstSync)
	}

	wCfg := cfg.WorkerConfig()
	if wCfg.Interval != 45*time.Minute || wCfg.WorkHoursStart != "07:30" || wCfg.SpreadsheetID != "custom-sheet-id" {
		t.Errorf("expected WorkerConfig to inherit config fields, got %+v", wCfg)
	}
	if wCfg.BypassWorkHoursOnFirstSync == nil || *wCfg.BypassWorkHoursOnFirstSync != false {
		t.Errorf("expected WorkerConfig BypassWorkHoursOnFirstSync to be false")
	}
}

func TestGoogleAPIKeyEnv(t *testing.T) {
	testKey := "AIzaSyDummyKeyForGoogleSheetsAccess123"
	t.Setenv("GOOGLE_API_KEY", testKey)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error loading config: %v", err)
	}

	if cfg.GoogleAPIKey != testKey {
		t.Errorf("expected GoogleAPIKey=%q, got %q", testKey, cfg.GoogleAPIKey)
	}
}

func TestGoogleAPIKeyFromEnvFile(t *testing.T) {
	oldVal, exists := os.LookupEnv("GOOGLE_API_KEY")
	if exists {
		os.Unsetenv("GOOGLE_API_KEY")
		defer os.Setenv("GOOGLE_API_KEY", oldVal)
	} else {
		defer os.Unsetenv("GOOGLE_API_KEY")
	}

	tmpDir := t.TempDir()
	envPath := tmpDir + "/.env"
	content := "GOOGLE_API_KEY=AIzaSyFromEnvFile987\n"
	if err := os.WriteFile(envPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp env file: %v", err)
	}

	cfg, err := config.Load(envPath)
	if err != nil {
		t.Fatalf("unexpected error loading config from env file: %v", err)
	}

	if cfg.GoogleAPIKey != "AIzaSyFromEnvFile987" {
		t.Errorf("expected GoogleAPIKey=AIzaSyFromEnvFile987, got %q", cfg.GoogleAPIKey)
	}
}

func TestAuthConfig(t *testing.T) {
	envKeys := map[string]string{
		"GOOGLE_CLIENT_ID":  "test-client-id.apps.googleusercontent.com",
		"JWT_SECRET":        "custom-test-secret-12345",
		"SUPERADMIN_EMAILS": "Admin@Example.com, boss@company.org , root@test.local",
	}
	for k, v := range envKeys {
		oldVal, exists := os.LookupEnv(k)
		if exists {
			defer os.Setenv(k, oldVal)
		} else {
			defer os.Unsetenv(k)
		}
		os.Setenv(k, v)
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.GoogleClientID != "test-client-id.apps.googleusercontent.com" {
		t.Errorf("expected GoogleClientID override, got %q", cfg.GoogleClientID)
	}
	if cfg.JWTSecret != "custom-test-secret-12345" {
		t.Errorf("expected JWTSecret override, got %q", cfg.JWTSecret)
	}
	if !cfg.IsSuperadmin("admin@example.com") {
		t.Errorf("expected admin@example.com to be superadmin")
	}
	if !cfg.IsSuperadmin("BOSS@company.org") {
		t.Errorf("expected BOSS@company.org (case insensitive) to be superadmin")
	}
	if !cfg.IsSuperadmin("root@test.local") {
		t.Errorf("expected root@test.local to be superadmin")
	}
	if cfg.IsSuperadmin("other@example.com") {
		t.Errorf("expected other@example.com NOT to be superadmin")
	}
	if cfg.IsSuperadmin("") {
		t.Errorf("expected empty email NOT to be superadmin")
	}
}

func TestAccurateConfigValidation(t *testing.T) {
	// 1. Invalid provider
	t.Run("invalid provider", func(t *testing.T) {
		t.Setenv("ACCURATE_PROVIDER", "unsupported")
		_, err := config.Load()
		if err == nil {
			t.Errorf("expected error for invalid ACCURATE_PROVIDER, got nil")
		}
	})

	// 2. Web provider missing credentials
	t.Run("web provider missing credentials", func(t *testing.T) {
		t.Setenv("ACCURATE_PROVIDER", "web")
		t.Setenv("ACCURATE_EMAIL", "")
		t.Setenv("ACCURATE_PASSWORD", "")
		_, err := config.Load()
		if err == nil {
			t.Errorf("expected error for web provider without credentials")
		}
	})

	// 3. Web provider valid
	t.Run("web provider valid", func(t *testing.T) {
		t.Setenv("ACCURATE_PROVIDER", "web")
		t.Setenv("ACCURATE_EMAIL", "test@accurate.id")
		t.Setenv("ACCURATE_PASSWORD", "secret123")
		cfg, err := config.Load()
		if err != nil {
			t.Fatalf("unexpected error for valid web config: %v", err)
		}
		if cfg.AccurateProvider != "web" || cfg.AccurateEmail != "test@accurate.id" || cfg.AccuratePassword != "secret123" {
			t.Errorf("unexpected web provider config: %+v", cfg)
		}
	})

	// 4. Official provider missing token
	t.Run("official provider missing token", func(t *testing.T) {
		t.Setenv("ACCURATE_PROVIDER", "official")
		t.Setenv("ACCURATE_API_TOKEN", "")
		_, err := config.Load()
		if err == nil {
			t.Errorf("expected error for official provider without token")
		}
	})

	// 5. Official provider valid
	t.Run("official provider valid", func(t *testing.T) {
		t.Setenv("ACCURATE_PROVIDER", "official")
		t.Setenv("ACCURATE_API_TOKEN", "aat.tok123")
		t.Setenv("ACCURATE_API_SIGNATURE_SECRET", "sigsecret456")
		cfg, err := config.Load()
		if err != nil {
			t.Fatalf("unexpected error for valid official config: %v", err)
		}
		if cfg.AccurateProvider != "official" || cfg.AccurateAPIToken != "aat.tok123" || cfg.AccurateAPISignatureSecret != "sigsecret456" {
			t.Errorf("unexpected official provider config: %+v", cfg)
		}
	})
}

func TestPostHogConfig(t *testing.T) {
	t.Run("VITE_POSTHOG fallback bindings", func(t *testing.T) {
		t.Setenv("POSTHOG_API_KEY", "")
		t.Setenv("POSTHOG_HOST", "")
		t.Setenv("VITE_POSTHOG_KEY", "phc_vite_fallback")
		t.Setenv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com")
		t.Setenv("OTEL_SERVICE_NAME", "custom-warehouse-api")
		t.Setenv("APP_ENV", "staging")
		t.Setenv("POSTHOG_LOG_LEVEL", "WARNING")

		cfg, err := config.Load()
		if err != nil {
			t.Fatalf("unexpected error loading VITE_POSTHOG fallback config: %v", err)
		}
		if cfg.PostHogAPIKey != "phc_vite_fallback" {
			t.Errorf("expected PostHogAPIKey=phc_vite_fallback, got %q", cfg.PostHogAPIKey)
		}
		if cfg.PostHogHost != "https://eu.i.posthog.com" {
			t.Errorf("expected PostHogHost=https://eu.i.posthog.com, got %q", cfg.PostHogHost)
		}
		if cfg.PostHogServiceName != "custom-warehouse-api" {
			t.Errorf("expected PostHogServiceName=custom-warehouse-api, got %q", cfg.PostHogServiceName)
		}
		if cfg.PostHogEnvironment != "staging" {
			t.Errorf("expected PostHogEnvironment=staging, got %q", cfg.PostHogEnvironment)
		}
		if cfg.PostHogLogLevel != "warn" {
			t.Errorf("expected normalized PostHogLogLevel=warn, got %q", cfg.PostHogLogLevel)
		}

		tCfg := cfg.TelemetryConfig()
		if tCfg.APIKey != "phc_vite_fallback" || tCfg.Host != "https://eu.i.posthog.com" || tCfg.ServiceName != "custom-warehouse-api" || tCfg.Environment != "staging" || tCfg.LogLevel != "warn" {
			t.Errorf("unexpected TelemetryConfig: %+v", tCfg)
		}
	})

	t.Run("invalid POSTHOG_LOG_LEVEL", func(t *testing.T) {
		t.Setenv("POSTHOG_LOG_LEVEL", "verbose")
		if _, err := config.Load(); err == nil {
			t.Errorf("expected error for invalid POSTHOG_LOG_LEVEL")
		}
	})

	t.Run("invalid POSTHOG_HOST when API key set", func(t *testing.T) {
		t.Setenv("POSTHOG_API_KEY", "phc_valid_key")
		t.Setenv("POSTHOG_HOST", "ftp://bad-host")
		if _, err := config.Load(); err == nil {
			t.Errorf("expected error for invalid POSTHOG_HOST when API key is set")
		}
	})
}
