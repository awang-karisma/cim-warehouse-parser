// Package worker provides background scheduled synchronization
// of warehouse order data from remote sources (Google Sheets or CSV) into local storage.
package worker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/parser"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"google.golang.org/api/sheets/v4"
)

// Config holds the configuration for the sync worker.
type Config struct {
	Interval        time.Duration  `json:"interval"`
	WorkHoursStart  string         `json:"work_hours_start"` // "08:00", HH:MM 24h format
	WorkHoursEnd    string         `json:"work_hours_end"`   // "17:00", HH:MM 24h format
	Timezone        string         `json:"timezone"`         // e.g. "Asia/Makassar", default UTC+8
	WorkDays        []time.Weekday `json:"work_days"`        // e.g. Mon-Sat
	SpreadsheetID   string         `json:"spreadsheet_id"`
	SheetName       string         `json:"sheet_name"`
	CSVFallbackPath            string         `json:"csv_fallback_path"`
	BypassWorkHoursOnFirstSync *bool          `json:"bypass_work_hours_on_first_sync"`
}

// Fetcher defines the interface for retrieving order items and orders from remote data.
type Fetcher interface {
	Fetch(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error)
}

// FetcherFunc is an adapter to allow the use of ordinary functions as Fetchers.
type FetcherFunc func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error)

// Fetch calls f(ctx, aliases).
func (f FetcherFunc) Fetch(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
	return f(ctx, aliases)
}

// NewSheetsFetcher creates a Fetcher backed by the Google Sheets service.
func NewSheetsFetcher(svc *sheets.Service, spreadsheetID, sheetName string) Fetcher {
	return FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
		return parser.ParseSheetWithAliases(ctx, svc, spreadsheetID, sheetName, aliases)
	})
}

// NewCSVFetcher creates a Fetcher backed by a local CSV file.
func NewCSVFetcher(filePath string) Fetcher {
	return FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
		return parser.ParseCSVFileWithAliases(filePath, aliases)
	})
}

// Status represents the operational status of the Worker.
type Status struct {
	LastRunTime       time.Time     `json:"last_run_time"`
	NextRunTime       time.Time     `json:"next_run_time"`
	LastDuration      time.Duration `json:"last_duration"`
	IsInsideWorkHours bool          `json:"is_inside_work_hours"`
	Status            string        `json:"status"` // "IDLE", "SYNCING", "OUTSIDE_HOURS", "ERROR"
	LastError         string        `json:"last_error,omitempty"`
}

// SyncEvent represents a progress or completion event during synchronization.
type SyncEvent struct {
	Status     string              `json:"status"` // "SYNCING", "SUCCESS", "ERROR"
	Message    string              `json:"message,omitempty"`
	Record     *storage.SyncRecord `json:"record,omitempty"`
	DurationMs int64               `json:"duration_ms,omitempty"`
	Error      string              `json:"error,omitempty"`
}

// Worker coordinates periodic synchronization within allowed work hours.
type Worker struct {
	cfg      Config
	store    *storage.Storage
	fetcher  Fetcher
	loc      *time.Location
	startMin int // minutes from midnight (0..1439)
	endMin   int // minutes from midnight (0..1439)
	bypassWorkHoursOnFirstSync bool
	syncMu       sync.Mutex

	mu           sync.RWMutex
	lastRunTime  time.Time
	lastDuration time.Duration
	status       string
	lastError    string

	subMu       sync.Mutex
	subscribers map[chan SyncEvent]struct{}
}

// New creates and initializes a new Worker.
func New(cfg Config, store *storage.Storage, fetcher Fetcher) (*Worker, error) {
	if store == nil {
		return nil, errors.New("storage cannot be nil")
	}

	if fetcher == nil {
		if cfg.CSVFallbackPath != "" {
			fetcher = NewCSVFetcher(cfg.CSVFallbackPath)
		} else {
			return nil, errors.New("fetcher or CSVFallbackPath must be provided")
		}
	}

	// Apply configuration defaults
	if cfg.Interval <= 0 {
		cfg.Interval = 15 * time.Minute
	}
	if cfg.WorkHoursStart == "" {
		cfg.WorkHoursStart = "08:00"
	}
	if cfg.WorkHoursEnd == "" {
		cfg.WorkHoursEnd = "17:00"
	}
	if cfg.Timezone == "" {
		cfg.Timezone = "Asia/Makassar"
	}
	if len(cfg.WorkDays) == 0 {
		cfg.WorkDays = []time.Weekday{
			time.Monday,
			time.Tuesday,
			time.Wednesday,
			time.Thursday,
			time.Friday,
			time.Saturday,
		}
	}

	loc, err := parseTimezone(cfg.Timezone)
	if err != nil {
		return nil, fmt.Errorf("failed to parse timezone: %w", err)
	}

	startMin, err := parseTimeOfDay(cfg.WorkHoursStart)
	if err != nil {
		return nil, fmt.Errorf("invalid WorkHoursStart: %w", err)
	}

	endMin, err := parseTimeOfDay(cfg.WorkHoursEnd)
	if err != nil {
		return nil, fmt.Errorf("invalid WorkHoursEnd: %w", err)
	}

	bypassOnFirst := true
	if cfg.BypassWorkHoursOnFirstSync != nil {
		bypassOnFirst = *cfg.BypassWorkHoursOnFirstSync
	}

	w := &Worker{
		cfg:      cfg,
		store:    store,
		fetcher:  fetcher,
		loc:      loc,
		startMin: startMin,
		endMin:   endMin,
		bypassWorkHoursOnFirstSync: bypassOnFirst,
		status:                     "IDLE",
		subscribers:                make(map[chan SyncEvent]struct{}),
	}
	return w, nil
}

// parseTimeOfDay parses HH:MM 24-hour format into minutes from midnight (0..1439).
func parseTimeOfDay(s string) (int, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, fmt.Errorf("expected format HH:MM, got %q", s)
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		return 0, fmt.Errorf("invalid hour %q in %q", parts[0], s)
	}
	min, err := strconv.Atoi(parts[1])
	if err != nil || min < 0 || min > 59 {
		return 0, fmt.Errorf("invalid minute %q in %q", parts[1], s)
	}
	return hour*60 + min, nil
}

// parseTimezone loads or creates a Location for the given timezone identifier.
func parseTimezone(tz string) (*time.Location, error) {
	clean := strings.TrimSpace(tz)
	switch strings.ToUpper(clean) {
	case "UTC+8", "GMT+8", "+08:00":
		return time.FixedZone("UTC+8", 8*3600), nil
	case "UTC+7", "GMT+7", "+07:00":
		return time.FixedZone("UTC+7", 7*3600), nil
	case "UTC+9", "GMT+9", "+09:00":
		return time.FixedZone("UTC+9", 9*3600), nil
	case "UTC", "GMT":
		return time.UTC, nil
	}

	loc, err := time.LoadLocation(clean)
	if err != nil {
		// Fallback for Asia/Makassar if zoneinfo is absent on host
		if clean == "Asia/Makassar" {
			return time.FixedZone("Asia/Makassar", 8*3600), nil
		}
		return nil, err
	}
	return loc, nil
}

// IsWithinWorkHours checks whether t falls within configured WorkDays and
// the half-open interval [WorkHoursStart, WorkHoursEnd) in the configured timezone.
func (w *Worker) IsWithinWorkHours(t time.Time) bool {
	tInLoc := t.In(w.loc)

	// Check weekday
	weekdayOK := false
	for _, wd := range w.cfg.WorkDays {
		if tInLoc.Weekday() == wd {
			weekdayOK = true
			break
		}
	}
	if !weekdayOK {
		return false
	}

	// Check minutes from midnight
	curMin := tInLoc.Hour()*60 + tInLoc.Minute()
	if w.startMin <= w.endMin {
		return curMin >= w.startMin && curMin < w.endMin
	}
	// Overnight interval (e.g. 22:00 to 06:00)
	return curMin >= w.startMin || curMin < w.endMin
}

// Subscribe registers a new subscriber channel for sync events.
func (w *Worker) Subscribe() <-chan SyncEvent {
	w.subMu.Lock()
	defer w.subMu.Unlock()
	ch := make(chan SyncEvent, 16)
	w.subscribers[ch] = struct{}{}
	return ch
}

// Unsubscribe removes a subscriber channel and closes it.
func (w *Worker) Unsubscribe(ch <-chan SyncEvent) {
	w.subMu.Lock()
	defer w.subMu.Unlock()
	for c := range w.subscribers {
		if c == ch {
			delete(w.subscribers, c)
			close(c)
			break
		}
	}
}

// broadcast sends an event to all active subscribers without blocking.
func (w *Worker) broadcast(evt SyncEvent) {
	w.subMu.Lock()
	defer w.subMu.Unlock()
	for ch := range w.subscribers {
		select {
		case ch <- evt:
		default:
			// subscriber is slow or stale, drop
		}
	}
}

// RunOnce performs a single synchronization run.
// If outside work hours and force is false, it logs and skips.
// If inside work hours or force is true, it calls fetcher and SyncMirror.
func (w *Worker) RunOnce(ctx context.Context, force bool) error {
	w.syncMu.Lock()
	defer w.syncMu.Unlock()

	if err := ctx.Err(); err != nil {
		return err
	}
	now := time.Now().In(w.loc)
	inHours := w.IsWithinWorkHours(now)

	isFirstSync := false
	if w.bypassWorkHoursOnFirstSync {
		hasSynced, err := w.store.HasSynced(ctx)
		if err != nil {
			lastRec, _ := w.store.GetLastSync(ctx)
			hasSynced = (lastRec != nil && lastRec.Status == "SUCCESS")
		}
		isFirstSync = !hasSynced
	}

	if !inHours && !force && !isFirstSync {
		log.Println("Outside working hours, skipping scheduled sync")
		w.mu.Lock()
		w.lastRunTime = now
		w.status = "OUTSIDE_HOURS"
		w.mu.Unlock()
		return nil
	}

	if !inHours && !force && isFirstSync {
		log.Println("First-time sync detected (no prior successful sync in database): bypassing working hours check to populate initial data")
	}

	w.mu.Lock()
	w.status = "SYNCING"
	w.mu.Unlock()
	w.broadcast(SyncEvent{Status: "SYNCING", Message: "fetching data from source"})

	startTime := time.Now()
	aliases, err := w.store.GetCustomerAliases(ctx)
	if err != nil {
		duration := time.Since(startTime)
		w.mu.Lock()
		w.lastRunTime = startTime
		w.lastDuration = duration
		w.status = "ERROR"
		w.lastError = err.Error()
		w.mu.Unlock()

		_ = w.store.RecordSync(ctx, "ERROR", 0, 0, fmt.Sprintf("failed to load customer aliases: %v", err), duration.Milliseconds())
		w.broadcast(SyncEvent{Status: "ERROR", Error: fmt.Sprintf("failed to load customer aliases: %v", err), DurationMs: duration.Milliseconds()})
		return fmt.Errorf("failed to load customer aliases: %w", err)
	}

	items, orders, err := w.fetcher.Fetch(ctx, aliases)
	if err != nil {
		duration := time.Since(startTime)
		w.mu.Lock()
		w.lastRunTime = startTime
		w.lastDuration = duration
		w.status = "ERROR"
		w.lastError = err.Error()
		w.mu.Unlock()

		_ = w.store.RecordSync(ctx, "ERROR", 0, 0, err.Error(), duration.Milliseconds())
		w.broadcast(SyncEvent{Status: "ERROR", Error: err.Error(), DurationMs: duration.Milliseconds()})
		return fmt.Errorf("fetch failed: %w", err)
	}

	w.broadcast(SyncEvent{Status: "SYNCING", Message: "writing to database"})
	err = w.store.SyncMirror(ctx, items, orders)
	duration := time.Since(startTime)

	w.mu.Lock()
	w.lastRunTime = startTime
	w.lastDuration = duration
	if err != nil {
		w.status = "ERROR"
		w.lastError = err.Error()
		w.mu.Unlock()

		_ = w.store.RecordSync(ctx, "ERROR", len(items), len(orders), err.Error(), duration.Milliseconds())
		w.broadcast(SyncEvent{Status: "ERROR", Error: err.Error(), DurationMs: duration.Milliseconds()})
		return fmt.Errorf("sync mirror failed: %w", err)
	}
	_ = w.store.UpdateLastSyncDuration(ctx, duration.Milliseconds())

	w.status = "IDLE"
	w.lastError = ""
	w.mu.Unlock()

	rec, _ := w.store.GetLastSync(ctx)
	w.broadcast(SyncEvent{Status: "SUCCESS", Record: rec, DurationMs: duration.Milliseconds()})
	log.Printf("Sync completed successfully (%d items, %d orders in %s)", len(items), len(orders), duration.Round(time.Millisecond))

	return nil
}

// Start runs the worker sync loop with a ticker at cfg.Interval until ctx is cancelled.
func (w *Worker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.cfg.Interval)
	defer ticker.Stop()

	// Initial run in background
	if err := w.RunOnce(ctx, false); err != nil {
		log.Printf("warning: initial background sync error: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.RunOnce(ctx, false); err != nil {
				log.Printf("warning: scheduled sync error: %v", err)
			}
		}
	}
}

// Status returns current snapshot metrics of the worker.
func (w *Worker) Status() Status {
	w.mu.RLock()
	defer w.mu.RUnlock()

	now := time.Now().In(w.loc)
	inHours := w.IsWithinWorkHours(now)

	var nextRun time.Time
	if !w.lastRunTime.IsZero() {
		nextRun = w.lastRunTime.Add(w.cfg.Interval)
	} else {
		nextRun = now.Add(w.cfg.Interval)
	}

	return Status{
		LastRunTime:       w.lastRunTime,
		NextRunTime:       nextRun,
		LastDuration:      w.lastDuration,
		IsInsideWorkHours: inHours,
		Status:            w.status,
		LastError:         w.lastError,
	}
}
