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
		"CSV_FALLBACK_PATH",
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
	t.Setenv("CSV_FALLBACK_PATH", "custom/sample.csv")

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
	if cfg.CSVFallbackPath != "custom/sample.csv" {
		t.Errorf("expected CSVFallbackPath=custom/sample.csv, got %s", cfg.CSVFallbackPath)
	}

	wCfg := cfg.WorkerConfig()
	if wCfg.Interval != 45*time.Minute || wCfg.WorkHoursStart != "07:30" || wCfg.SpreadsheetID != "custom-sheet-id" {
		t.Errorf("expected WorkerConfig to inherit config fields, got %+v", wCfg)
	}
}
