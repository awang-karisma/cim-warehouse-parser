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
