// Package config handles application configuration loading and validation
// using Viper and godotenv with support for environment variable overrides.
package config

import (
	"reflect"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/go-viper/mapstructure/v2"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config holds all server, database, and sync worker configuration parameters.
type Config struct {
	Port                         string        `mapstructure:"server_port" json:"port"`
	DBPath                       string        `mapstructure:"db_path" json:"db_path"`
	SyncInterval                 time.Duration `mapstructure:"sync_interval" json:"sync_interval"`
	WorkHoursStart               string        `mapstructure:"sync_work_hours_start" json:"work_hours_start"`
	WorkHoursEnd                 string        `mapstructure:"sync_work_hours_end" json:"work_hours_end"`
	Timezone                     string        `mapstructure:"sync_timezone" json:"timezone"`
	SpreadsheetID                string        `mapstructure:"spreadsheet_id" json:"spreadsheet_id"`
	SheetName                    string        `mapstructure:"sheet_name" json:"sheet_name"`
	GoogleApplicationCredentials string        `mapstructure:"google_application_credentials" json:"google_application_credentials"`
	CSVFallbackPath              string        `mapstructure:"csv_fallback_path" json:"csv_fallback_path"`
}

// DefaultConfig returns a Config struct with default configuration values.
func DefaultConfig() Config {
	return Config{
		Port:                         "8080",
		DBPath:                       "data/warehouse.db",
		SyncInterval:                 15 * time.Minute,
		WorkHoursStart:               "08:00",
		WorkHoursEnd:                 "17:00",
		Timezone:                     "Asia/Makassar",
		SpreadsheetID:                "1X3FqpqpP7utvkyFK98YE863ItVsvmmUrBTBsGfuzK3s",
		SheetName:                    "PESANAN",
		GoogleApplicationCredentials: "",
		CSVFallbackPath:              "testdata/orders_sample.csv",
	}
}

// Load initializes application configuration by loading .env (if present)
// and overriding values with system environment variables.
func Load(envFiles ...string) (*Config, error) {
	if len(envFiles) > 0 {
		_ = godotenv.Load(envFiles...)
	} else {
		_ = godotenv.Load()
	}

	v := viper.New()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Register sensible defaults
	defaults := DefaultConfig()
	v.SetDefault("server_port", defaults.Port)
	v.SetDefault("db_path", defaults.DBPath)
	v.SetDefault("sync_interval", defaults.SyncInterval)
	v.SetDefault("sync_work_hours_start", defaults.WorkHoursStart)
	v.SetDefault("sync_work_hours_end", defaults.WorkHoursEnd)
	v.SetDefault("sync_timezone", defaults.Timezone)
	v.SetDefault("spreadsheet_id", defaults.SpreadsheetID)
	v.SetDefault("sheet_name", defaults.SheetName)
	v.SetDefault("google_application_credentials", defaults.GoogleApplicationCredentials)
	v.SetDefault("csv_fallback_path", defaults.CSVFallbackPath)

	// Bind environment keys
	_ = v.BindEnv("server_port", "SERVER_PORT", "PORT")
	_ = v.BindEnv("db_path", "DB_PATH")
	_ = v.BindEnv("sync_interval", "SYNC_INTERVAL")
	_ = v.BindEnv("sync_work_hours_start", "SYNC_WORK_HOURS_START")
	_ = v.BindEnv("sync_work_hours_end", "SYNC_WORK_HOURS_END")
	_ = v.BindEnv("sync_timezone", "SYNC_TIMEZONE")
	_ = v.BindEnv("spreadsheet_id", "SPREADSHEET_ID")
	_ = v.BindEnv("sheet_name", "SHEET_NAME")
	_ = v.BindEnv("google_application_credentials", "GOOGLE_APPLICATION_CREDENTIALS")
	_ = v.BindEnv("csv_fallback_path", "CSV_FALLBACK_PATH")

	var cfg Config
	decodeHook := viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(
		mapstructure.StringToTimeDurationHookFunc(),
		stringToTimeDurationFallbackHookFunc(),
	))

	if err := v.Unmarshal(&cfg, decodeHook); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// stringToTimeDurationFallbackHookFunc helps convert numbers or string duration to time.Duration.
func stringToTimeDurationFallbackHookFunc() mapstructure.DecodeHookFuncType {
	return func(f reflect.Type, t reflect.Type, data any) (any, error) {
		if t != reflect.TypeOf(time.Duration(0)) {
			return data, nil
		}
		switch val := data.(type) {
		case string:
			return time.ParseDuration(val)
		case int:
			return time.Duration(val), nil
		case int64:
			return time.Duration(val), nil
		case float64:
			return time.Duration(val), nil
		default:
			return data, nil
		}
	}
}

// WorkerConfig converts the Config struct into worker.Config.
func (c *Config) WorkerConfig() worker.Config {
	return worker.Config{
		Interval:        c.SyncInterval,
		WorkHoursStart:  c.WorkHoursStart,
		WorkHoursEnd:    c.WorkHoursEnd,
		Timezone:        c.Timezone,
		SpreadsheetID:   c.SpreadsheetID,
		SheetName:       c.SheetName,
		CSVFallbackPath: c.CSVFallbackPath,
	}
}
