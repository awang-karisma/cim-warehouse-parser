// Package config handles application configuration loading and validation
// using Viper and godotenv with support for environment variable overrides.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"reflect"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/accurate"
	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"github.com/awang-karisma/warehouse-parser/pkg/version"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/go-viper/mapstructure/v2"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config holds all server, database, and sync worker configuration parameters.
type Config struct {
	Port                           string        `mapstructure:"server_port" json:"port"`
	DBPath                         string        `mapstructure:"db_path" json:"db_path"`
	SyncInterval                   time.Duration `mapstructure:"sync_interval" json:"sync_interval"`
	WorkHoursStart                 string        `mapstructure:"sync_work_hours_start" json:"work_hours_start"`
	WorkHoursEnd                   string        `mapstructure:"sync_work_hours_end" json:"work_hours_end"`
	Timezone                       string        `mapstructure:"sync_timezone" json:"timezone"`
	SpreadsheetID                  string        `mapstructure:"spreadsheet_id" json:"spreadsheet_id"`
	SheetName                      string        `mapstructure:"sheet_name" json:"sheet_name"`
	POSheetName                    string        `mapstructure:"po_sheet_name" json:"po_sheet_name"`
	GoogleApplicationCredentials   string        `mapstructure:"google_application_credentials" json:"google_application_credentials"`
	GoogleAPIKey                   string        `mapstructure:"google_api_key" json:"google_api_key"`
	CSVFallbackPath                string        `mapstructure:"csv_fallback_path" json:"csv_fallback_path"`
	SyncBypassWorkHoursOnFirstSync bool          `mapstructure:"sync_bypass_work_hours_on_first_sync" json:"sync_bypass_work_hours_on_first_sync"`
	GoogleClientID                 string        `mapstructure:"google_client_id" json:"google_client_id"`
	JWTSecret                      string        `mapstructure:"jwt_secret" json:"jwt_secret"`
	SuperadminEmails               string        `mapstructure:"superadmin_emails" json:"superadmin_emails"`
	AccurateProvider               string        `mapstructure:"accurate_provider" json:"accurate_provider"`
	AccurateEmail                  string        `mapstructure:"accurate_email" json:"-"`
	AccuratePassword               string        `mapstructure:"accurate_password" json:"-"`
	AccurateAPIToken               string        `mapstructure:"accurate_api_token" json:"-"`
	AccurateAPISignatureSecret     string        `mapstructure:"accurate_api_signature_secret" json:"-"`
	PostHogAPIKey                  string        `mapstructure:"posthog_api_key" json:"-"`
	PostHogHost                    string        `mapstructure:"posthog_host" json:"posthog_host"`
	PostHogServiceName             string        `mapstructure:"posthog_service_name" json:"posthog_service_name"`
	PostHogEnvironment             string        `mapstructure:"posthog_environment" json:"posthog_environment"`
	PostHogLogLevel                string        `mapstructure:"posthog_log_level" json:"posthog_log_level"`
	MapTileCacheDir                string        `mapstructure:"map_tile_cache_dir" json:"map_tile_cache_dir"`
	MapTileCacheTTL                time.Duration `mapstructure:"map_tile_cache_ttl" json:"map_tile_cache_ttl"`
	MapTileCacheMaxSizeMB          int64         `mapstructure:"map_tile_cache_max_size_mb" json:"map_tile_cache_max_size_mb"`
	MapCartoAPIKey                 string        `mapstructure:"map_carto_api_key" json:"-"`
	MapOSMAPIKey                   string        `mapstructure:"map_osm_api_key" json:"-"`
	MapEsriAPIKey                  string        `mapstructure:"map_esri_api_key" json:"-"`
}

// DefaultConfig returns a Config struct with default configuration values.
func DefaultConfig() Config {
	return Config{
		Port:                           "8080",
		DBPath:                         "data/warehouse.db",
		SyncInterval:                   15 * time.Minute,
		WorkHoursStart:                 "08:00",
		WorkHoursEnd:                   "17:00",
		Timezone:                       "Asia/Makassar",
		SpreadsheetID:                  "1X3FqpqpP7utvkyFK98YE863ItVsvmmUrBTBsGfuzK3s",
		SheetName:                      "PESANAN",
		POSheetName:                    "PERMINTAAN PEMBELIAN",
		GoogleApplicationCredentials:   "",
		GoogleAPIKey:                   "",
		CSVFallbackPath:                "testdata/orders_sample.csv",
		SyncBypassWorkHoursOnFirstSync: true,
		GoogleClientID:                 "",
		JWTSecret:                      "",
		SuperadminEmails:               "",
		AccurateProvider:               "",
		AccurateEmail:                  "",
		AccuratePassword:               "",
		AccurateAPIToken:               "",
		AccurateAPISignatureSecret:     "",
		PostHogAPIKey:                  "",
		PostHogHost:                    telemetry.DefaultHost,
		PostHogServiceName:             telemetry.DefaultServiceName,
		PostHogEnvironment:             telemetry.DefaultEnvironment,
		PostHogLogLevel:                string(telemetry.LevelInfo),
		MapTileCacheDir:                "data/maptiles",
		MapTileCacheTTL:                720 * time.Hour,
		MapTileCacheMaxSizeMB:          512,
		MapCartoAPIKey:                 "",
		MapOSMAPIKey:                   "",
		MapEsriAPIKey:                  "",
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
	v.SetDefault("po_sheet_name", defaults.POSheetName)
	v.SetDefault("google_application_credentials", defaults.GoogleApplicationCredentials)
	v.SetDefault("google_api_key", defaults.GoogleAPIKey)
	v.SetDefault("csv_fallback_path", defaults.CSVFallbackPath)
	v.SetDefault("sync_bypass_work_hours_on_first_sync", defaults.SyncBypassWorkHoursOnFirstSync)
	v.SetDefault("google_client_id", defaults.GoogleClientID)
	v.SetDefault("jwt_secret", defaults.JWTSecret)
	v.SetDefault("superadmin_emails", defaults.SuperadminEmails)
	v.SetDefault("accurate_provider", defaults.AccurateProvider)
	v.SetDefault("accurate_email", defaults.AccurateEmail)
	v.SetDefault("accurate_password", defaults.AccuratePassword)
	v.SetDefault("accurate_api_token", defaults.AccurateAPIToken)
	v.SetDefault("accurate_api_signature_secret", defaults.AccurateAPISignatureSecret)
	v.SetDefault("posthog_api_key", defaults.PostHogAPIKey)
	v.SetDefault("posthog_host", defaults.PostHogHost)
	v.SetDefault("posthog_service_name", defaults.PostHogServiceName)
	v.SetDefault("posthog_environment", defaults.PostHogEnvironment)
	v.SetDefault("posthog_log_level", defaults.PostHogLogLevel)
	v.SetDefault("map_tile_cache_dir", defaults.MapTileCacheDir)
	v.SetDefault("map_tile_cache_ttl", defaults.MapTileCacheTTL)
	v.SetDefault("map_tile_cache_max_size_mb", defaults.MapTileCacheMaxSizeMB)
	v.SetDefault("map_carto_api_key", defaults.MapCartoAPIKey)
	v.SetDefault("map_osm_api_key", defaults.MapOSMAPIKey)
	v.SetDefault("map_esri_api_key", defaults.MapEsriAPIKey)
	// Bind environment keys
	_ = v.BindEnv("server_port", "SERVER_PORT", "PORT")
	_ = v.BindEnv("db_path", "DB_PATH")
	_ = v.BindEnv("sync_interval", "SYNC_INTERVAL")
	_ = v.BindEnv("sync_work_hours_start", "SYNC_WORK_HOURS_START")
	_ = v.BindEnv("sync_work_hours_end", "SYNC_WORK_HOURS_END")
	_ = v.BindEnv("sync_timezone", "SYNC_TIMEZONE")
	_ = v.BindEnv("spreadsheet_id", "SPREADSHEET_ID")
	_ = v.BindEnv("sheet_name", "SHEET_NAME")
	_ = v.BindEnv("po_sheet_name", "PO_SHEET_NAME")
	_ = v.BindEnv("google_application_credentials", "GOOGLE_APPLICATION_CREDENTIALS")
	_ = v.BindEnv("google_api_key", "GOOGLE_API_KEY")
	_ = v.BindEnv("csv_fallback_path", "CSV_FALLBACK_PATH")
	_ = v.BindEnv("sync_bypass_work_hours_on_first_sync", "SYNC_BYPASS_WORK_HOURS_ON_FIRST_SYNC")
	_ = v.BindEnv("google_client_id", "GOOGLE_CLIENT_ID")
	_ = v.BindEnv("jwt_secret", "JWT_SECRET")
	_ = v.BindEnv("superadmin_emails", "SUPERADMIN_EMAILS")
	_ = v.BindEnv("accurate_provider", "ACCURATE_PROVIDER")
	_ = v.BindEnv("accurate_email", "ACCURATE_EMAIL")
	_ = v.BindEnv("accurate_password", "ACCURATE_PASSWORD")
	_ = v.BindEnv("accurate_api_token", "ACCURATE_API_TOKEN")
	_ = v.BindEnv("accurate_api_signature_secret", "ACCURATE_API_SIGNATURE_SECRET")
	_ = v.BindEnv("posthog_api_key", "POSTHOG_API_KEY", "VITE_POSTHOG_KEY")
	_ = v.BindEnv("posthog_host", "POSTHOG_HOST", "VITE_POSTHOG_HOST")
	_ = v.BindEnv("posthog_service_name", "POSTHOG_SERVICE_NAME", "OTEL_SERVICE_NAME")
	_ = v.BindEnv("posthog_environment", "POSTHOG_ENVIRONMENT", "APP_ENV")
	_ = v.BindEnv("posthog_log_level", "POSTHOG_LOG_LEVEL")
	_ = v.BindEnv("map_tile_cache_dir", "MAP_TILE_CACHE_DIR")
	_ = v.BindEnv("map_tile_cache_ttl", "MAP_TILE_CACHE_TTL")
	_ = v.BindEnv("map_tile_cache_max_size_mb", "MAP_TILE_CACHE_MAX_SIZE_MB")
	_ = v.BindEnv("map_carto_api_key", "MAP_CARTO_API_KEY")
	_ = v.BindEnv("map_osm_api_key", "MAP_OSM_API_KEY")
	_ = v.BindEnv("map_esri_api_key", "MAP_ESRI_API_KEY")
	var cfg Config
	decodeHook := viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(
		mapstructure.StringToTimeDurationHookFunc(),
		stringToTimeDurationFallbackHookFunc(),
	))

	if err := v.Unmarshal(&cfg, decodeHook); err != nil {
		return nil, err
	}

	if cfg.JWTSecret == "" {
		bytes := make([]byte, 32)
		if _, err := rand.Read(bytes); err != nil {
			return nil, fmt.Errorf("failed to generate random jwt secret: %w", err)
		}
		cfg.JWTSecret = hex.EncodeToString(bytes)
		log.Println("WARNING: JWT_SECRET not set; generated random secret. Sessions will not survive server restarts.")
	}

	prov := strings.ToLower(strings.TrimSpace(cfg.AccurateProvider))
	switch accurate.ProviderKind(prov) {
	case "":
	case accurate.ProviderWeb:
		if strings.TrimSpace(cfg.AccurateEmail) == "" || strings.TrimSpace(cfg.AccuratePassword) == "" {
			return nil, fmt.Errorf("ACCURATE_EMAIL and ACCURATE_PASSWORD are required when ACCURATE_PROVIDER=web")
		}
	case accurate.ProviderOfficial:
		if strings.TrimSpace(cfg.AccurateAPIToken) == "" {
			return nil, fmt.Errorf("ACCURATE_API_TOKEN is required when ACCURATE_PROVIDER=official")
		}
	default:
		return nil, fmt.Errorf("invalid ACCURATE_PROVIDER %q: must be 'web', 'official', or empty", cfg.AccurateProvider)
	}
	cfg.AccurateProvider = prov

	logLvl, _, err := telemetry.ParseLogLevel(cfg.PostHogLogLevel)
	if err != nil {
		return nil, err
	}
	cfg.PostHogLogLevel = string(logLvl)
	if strings.TrimSpace(cfg.PostHogAPIKey) != "" {
		if _, err := telemetry.ResolveEndpointURL(cfg.PostHogHost); err != nil {
			return nil, err
		}
	}

	if cfg.MapTileCacheTTL < 0 {
		return nil, fmt.Errorf("MAP_TILE_CACHE_TTL cannot be negative: %s", cfg.MapTileCacheTTL)
	}
	if cfg.MapTileCacheMaxSizeMB < 0 {
		return nil, fmt.Errorf("MAP_TILE_CACHE_MAX_SIZE_MB cannot be negative: %d", cfg.MapTileCacheMaxSizeMB)
	}
	if strings.TrimSpace(cfg.MapTileCacheDir) == "" {
		cfg.MapTileCacheDir = defaults.MapTileCacheDir
	}
	cfg.MapCartoAPIKey = strings.TrimSpace(cfg.MapCartoAPIKey)
	cfg.MapOSMAPIKey = strings.TrimSpace(cfg.MapOSMAPIKey)
	cfg.MapEsriAPIKey = strings.TrimSpace(cfg.MapEsriAPIKey)

	return &cfg, nil
}

// IsSuperadmin reports whether the given email is listed in SuperadminEmails.
func (c *Config) IsSuperadmin(email string) bool {
	trimmedEmail := strings.TrimSpace(email)
	if trimmedEmail == "" || c.SuperadminEmails == "" {
		return false
	}
	for _, admin := range strings.Split(c.SuperadminEmails, ",") {
		if strings.EqualFold(strings.TrimSpace(admin), trimmedEmail) {
			return true
		}
	}
	return false
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
		Interval:                   c.SyncInterval,
		WorkHoursStart:             c.WorkHoursStart,
		WorkHoursEnd:               c.WorkHoursEnd,
		Timezone:                   c.Timezone,
		SpreadsheetID:              c.SpreadsheetID,
		SheetName:                  c.SheetName,
		POSheetName:                c.POSheetName,
		CSVFallbackPath:            c.CSVFallbackPath,
		BypassWorkHoursOnFirstSync: &c.SyncBypassWorkHoursOnFirstSync,
	}
}

// TelemetryConfig converts the Config struct into telemetry.Config.
func (c *Config) TelemetryConfig() telemetry.Config {
	return telemetry.Config{
		APIKey:         c.PostHogAPIKey,
		Host:           c.PostHogHost,
		ServiceName:    c.PostHogServiceName,
		ServiceVersion: version.Version,
		Environment:    c.PostHogEnvironment,
		LogLevel:       c.PostHogLogLevel,
	}
}
