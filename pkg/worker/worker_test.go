package worker_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
)

type mockFetcher struct {
	items      []model.NormalizedItem
	orders     []model.Order
	err        error
	fetchCount int
}

func (m *mockFetcher) Fetch(ctx context.Context) ([]model.NormalizedItem, []model.Order, error) {
	m.fetchCount++
	if m.err != nil {
		return nil, nil, m.err
	}
	return m.items, m.orders, nil
}

func sampleMockData() ([]model.NormalizedItem, []model.Order) {
	items := []model.NormalizedItem{
		{
			RowIndex:    2,
			Tanggal:     "02/01/2026",
			Customer:    "RS Narmada",
			Area:        "Lombok Barat",
			NamaBarang:  "Yellowtip",
			Jumlah:      "6",
			StatusOrder: "COMPLETED",
		},
	}
	orders := []model.Order{
		{
			ID:       "ORD-0001",
			Tanggal:  "02/01/2026",
			Customer: "RS Narmada",
			Area:     "Lombok Barat",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Yellowtip", Jumlah: "6"},
			},
		},
	}
	return items, orders
}

func TestIsWithinWorkHours(t *testing.T) {
	cfg := worker.Config{
		WorkHoursStart: "08:00",
		WorkHoursEnd:   "17:00",
		Timezone:       "Asia/Makassar", // UTC+8
		WorkDays: []time.Weekday{
			time.Monday,
			time.Tuesday,
			time.Wednesday,
			time.Thursday,
			time.Friday,
			time.Saturday,
		},
	}

	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	w, err := worker.New(cfg, store, &mockFetcher{})
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	makassar := time.FixedZone("Asia/Makassar", 8*3600)

	testCases := []struct {
		name     string
		time     time.Time
		expected bool
	}{
		{
			name:     "Monday at 08:00 (exact start)",
			time:     time.Date(2026, 10, 19, 8, 0, 0, 0, makassar), // Monday
			expected: true,
		},
		{
			name:     "Monday at 12:30 (middle of work hours)",
			time:     time.Date(2026, 10, 19, 12, 30, 0, 0, makassar),
			expected: true,
		},
		{
			name:     "Monday at 16:59 (last minute of work hours)",
			time:     time.Date(2026, 10, 19, 16, 59, 59, 0, makassar),
			expected: true,
		},
		{
			name:     "Monday at 17:00 (exact end boundary [start, end))",
			time:     time.Date(2026, 10, 19, 17, 0, 0, 0, makassar),
			expected: false,
		},
		{
			name:     "Monday at 07:59 (before start)",
			time:     time.Date(2026, 10, 19, 7, 59, 0, 0, makassar),
			expected: false,
		},
		{
			name:     "Monday at 22:00 (night time)",
			time:     time.Date(2026, 10, 19, 22, 0, 0, 0, makassar),
			expected: false,
		},
		{
			name:     "Saturday at 10:00 (Saturday is a work day)",
			time:     time.Date(2026, 10, 24, 10, 0, 0, 0, makassar), // Saturday
			expected: true,
		},
		{
			name:     "Sunday at 12:00 (Sunday is weekend, outside work days)",
			time:     time.Date(2026, 10, 25, 12, 0, 0, 0, makassar), // Sunday
			expected: false,
		},
		{
			name:     "UTC conversion verification (Monday 00:00 UTC == 08:00 Makassar)",
			time:     time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC),
			expected: true,
		},
		{
			name:     "UTC conversion verification (Monday 09:00 UTC == 17:00 Makassar)",
			time:     time.Date(2026, 10, 19, 9, 0, 0, 0, time.UTC),
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := w.IsWithinWorkHours(tc.time)
			if got != tc.expected {
				t.Errorf("IsWithinWorkHours(%v) = %v, expected %v", tc.time, got, tc.expected)
			}
		})
	}
}

func TestIsWithinWorkHours_Overnight(t *testing.T) {
	cfg := worker.Config{
		WorkHoursStart: "22:00",
		WorkHoursEnd:   "06:00",
		Timezone:       "UTC",
		WorkDays:       []time.Weekday{time.Monday},
	}

	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	w, err := worker.New(cfg, store, &mockFetcher{})
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	// Monday 23:00 -> true
	if !w.IsWithinWorkHours(time.Date(2026, 10, 19, 23, 0, 0, 0, time.UTC)) {
		t.Error("expected 23:00 Monday to be within hours")
	}
	// Monday 05:00 -> true
	if !w.IsWithinWorkHours(time.Date(2026, 10, 19, 5, 0, 0, 0, time.UTC)) {
		t.Error("expected 05:00 Monday to be within hours")
	}
	// Monday 06:00 -> false
	if w.IsWithinWorkHours(time.Date(2026, 10, 19, 6, 0, 0, 0, time.UTC)) {
		t.Error("expected 06:00 Monday to be outside hours")
	}
	// Monday 12:00 -> false
	if w.IsWithinWorkHours(time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)) {
		t.Error("expected 12:00 Monday to be outside hours")
	}
}

func TestRunOnce_SkipsOutsideHoursWithoutForce(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Configure work days to a single day that is definitely NOT today
	now := time.Now()
	oppositeDay := (now.Weekday() + 3) % 7
	bypassFalse := false
	cfg := worker.Config{
		WorkHoursStart:             "08:00",
		WorkHoursEnd:               "17:00",
		WorkDays:                   []time.Weekday{oppositeDay},
		BypassWorkHoursOnFirstSync: &bypassFalse,
	}

	items, orders := sampleMockData()
	fetcher := &mockFetcher{items: items, orders: orders}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	if err := w.RunOnce(ctx, false); err != nil {
		t.Fatalf("RunOnce(ctx, false) returned unexpected error: %v", err)
	}

	// Fetcher should NOT have been called
	if fetcher.fetchCount != 0 {
		t.Errorf("expected fetchCount 0, got %d", fetcher.fetchCount)
	}

	// Worker status should be OUTSIDE_HOURS
	status := w.Status()
	if status.Status != "OUTSIDE_HOURS" {
		t.Errorf("expected status 'OUTSIDE_HOURS', got %q", status.Status)
	}
	if status.IsInsideWorkHours {
		t.Error("expected IsInsideWorkHours to be false")
	}

	// Storage should remain empty
	lastSync, err := store.GetLastSync(ctx)
	if err != nil {
		t.Fatalf("GetLastSync error: %v", err)
	}
	if lastSync != nil {
		t.Errorf("expected no sync history, got %+v", lastSync)
	}
}

func TestRunOnce_FirstTimeSyncBypassesWorkHours(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Configure work days to a single day that is definitely NOT today (inHours = false)
	now := time.Now()
	oppositeDay := (now.Weekday() + 3) % 7
	cfg := worker.Config{
		WorkHoursStart: "08:00",
		WorkHoursEnd:   "17:00",
		WorkDays:       []time.Weekday{oppositeDay},
	}

	items, orders := sampleMockData()
	fetcher := &mockFetcher{items: items, orders: orders}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	// First run: storage is empty, bypass should trigger even though outside hours and force=false
	if err := w.RunOnce(ctx, false); err != nil {
		t.Fatalf("RunOnce(ctx, false) returned unexpected error: %v", err)
	}

	// Verify it runs sync (fetchCount == 1, status is IDLE, data is stored)
	if fetcher.fetchCount != 1 {
		t.Errorf("expected fetchCount 1, got %d", fetcher.fetchCount)
	}

	status := w.Status()
	if status.Status != "IDLE" {
		t.Errorf("expected status 'IDLE', got %q", status.Status)
	}

	ordersStored, total, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil || total != 1 || len(ordersStored) != 1 {
		t.Fatalf("expected 1 stored order, got total=%d len=%d err=%v", total, len(ordersStored), err)
	}

	// Second run: now initial sync has succeeded, so outside hours check should apply
	if err := w.RunOnce(ctx, false); err != nil {
		t.Fatalf("second RunOnce(ctx, false) returned unexpected error: %v", err)
	}

	// Verify it now skips (fetchCount == 1, status is OUTSIDE_HOURS)
	if fetcher.fetchCount != 1 {
		t.Errorf("expected fetchCount still 1 after second run, got %d", fetcher.fetchCount)
	}

	status = w.Status()
	if status.Status != "OUTSIDE_HOURS" {
		t.Errorf("expected status 'OUTSIDE_HOURS' on second run, got %q", status.Status)
	}
}

func TestRunOnce_ForceOutsideHours(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Configure outside hours
	now := time.Now()
	oppositeDay := (now.Weekday() + 3) % 7
	cfg := worker.Config{
		WorkHoursStart: "08:00",
		WorkHoursEnd:   "17:00",
		WorkDays:       []time.Weekday{oppositeDay},
	}

	items, orders := sampleMockData()
	fetcher := &mockFetcher{items: items, orders: orders}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	// Run with force = true
	if err := w.RunOnce(ctx, true); err != nil {
		t.Fatalf("RunOnce(ctx, true) failed: %v", err)
	}

	// Fetcher MUST have been called
	if fetcher.fetchCount != 1 {
		t.Errorf("expected fetchCount 1, got %d", fetcher.fetchCount)
	}

	// Worker status should be IDLE after successful run
	status := w.Status()
	if status.Status != "IDLE" {
		t.Errorf("expected status 'IDLE', got %q", status.Status)
	}

	// Storage must be updated
	ordersStored, total, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil || total != 1 || len(ordersStored) != 1 {
		t.Fatalf("expected 1 stored order, got total=%d len=%d err=%v", total, len(ordersStored), err)
	}
	if ordersStored[0].ID != "ORD-0001" {
		t.Errorf("expected order ORD-0001, got %q", ordersStored[0].ID)
	}

	// Sync history must record success
	lastSync, err := store.GetLastSync(ctx)
	if err != nil || lastSync == nil {
		t.Fatalf("expected sync record, got nil, err: %v", err)
	}
	if lastSync.Status != "SUCCESS" || lastSync.OrdersCount != 1 {
		t.Errorf("unexpected sync record: %+v", lastSync)
	}
}

func TestRunOnce_InsideHours(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Configure hours to cover 24 hours every day
	cfg := worker.Config{
		WorkHoursStart: "00:00",
		WorkHoursEnd:   "23:59",
		WorkDays: []time.Weekday{
			time.Sunday, time.Monday, time.Tuesday, time.Wednesday,
			time.Thursday, time.Friday, time.Saturday,
		},
	}

	items, orders := sampleMockData()
	fetcher := &mockFetcher{items: items, orders: orders}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	if err := w.RunOnce(ctx, false); err != nil {
		t.Fatalf("RunOnce inside hours failed: %v", err)
	}

	if fetcher.fetchCount != 1 {
		t.Errorf("expected fetchCount 1, got %d", fetcher.fetchCount)
	}

	status := w.Status()
	if status.Status != "IDLE" {
		t.Errorf("expected status 'IDLE', got %q", status.Status)
	}
	if !status.IsInsideWorkHours {
		t.Error("expected IsInsideWorkHours to be true")
	}
}

func TestRunOnce_FetcherError(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	cfg := worker.Config{
		WorkHoursStart: "00:00",
		WorkHoursEnd:   "23:59",
		WorkDays: []time.Weekday{
			time.Sunday, time.Monday, time.Tuesday, time.Wednesday,
			time.Thursday, time.Friday, time.Saturday,
		},
	}

	fetchErr := errors.New("network unreachable: sheets.googleapis.com")
	fetcher := &mockFetcher{err: fetchErr}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	err = w.RunOnce(ctx, false)
	if err == nil {
		t.Fatal("expected error from RunOnce, got nil")
	}

	status := w.Status()
	if status.Status != "ERROR" {
		t.Errorf("expected status 'ERROR', got %q", status.Status)
	}
	if status.LastError == "" {
		t.Error("expected LastError to be populated")
	}

	// Verify error was recorded in storage sync history
	lastSync, err := store.GetLastSync(ctx)
	if err != nil || lastSync == nil {
		t.Fatalf("expected sync record with error, got nil, err: %v", err)
	}
	if lastSync.Status != "ERROR" {
		t.Errorf("expected sync history status 'ERROR', got %q", lastSync.Status)
	}
}

func TestWorker_StartGracefulShutdown(t *testing.T) {
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	cfg := worker.Config{
		Interval:       10 * time.Millisecond,
		WorkHoursStart: "00:00",
		WorkHoursEnd:   "23:59",
		WorkDays: []time.Weekday{
			time.Sunday, time.Monday, time.Tuesday, time.Wednesday,
			time.Thursday, time.Friday, time.Saturday,
		},
	}

	items, orders := sampleMockData()
	fetcher := &mockFetcher{items: items, orders: orders}

	w, err := worker.New(cfg, store, fetcher)
	if err != nil {
		t.Fatalf("failed to create worker: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		w.Start(ctx)
		close(done)
	}()

	select {
	case <-done:
		// Exited gracefully
	case <-time.After(500 * time.Millisecond):
		t.Fatal("worker.Start did not shut down gracefully within timeout")
	}

	if fetcher.fetchCount < 1 {
		t.Errorf("expected at least 1 fetch run, got %d", fetcher.fetchCount)
	}
}

func TestWorker_CSVFallback(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Write temporary CSV file
	tempDir := t.TempDir()
	csvPath := filepath.Join(tempDir, "orders.csv")
	csvContent := `Tanggal,Customer,Area,Nama Barang,Jumlah,Satuan,Tanggal Pengiriman,Lead Time Pengiriman,Jumlah Terkirim,Belum Terkirim,Status Order,Status Barang,Keterangan,Catatan
02/01/2026,RS Siloam,Mataram,Infus Set,15,BOX,02/01/2026,0,15,0,COMPLETED,READY,Lengkap,
`
	if err := os.WriteFile(csvPath, []byte(csvContent), 0644); err != nil {
		t.Fatalf("failed to write test csv: %v", err)
	}

	cfg := worker.Config{
		CSVFallbackPath: csvPath,
		WorkHoursStart:  "00:00",
		WorkHoursEnd:    "23:59",
		WorkDays: []time.Weekday{
			time.Sunday, time.Monday, time.Tuesday, time.Wednesday,
			time.Thursday, time.Friday, time.Saturday,
		},
	}

	// Create worker with nil fetcher (should use CSV fallback)
	w, err := worker.New(cfg, store, nil)
	if err != nil {
		t.Fatalf("failed to create worker with CSV fallback: %v", err)
	}

	if err := w.RunOnce(ctx, true); err != nil {
		t.Fatalf("RunOnce with CSV fallback failed: %v", err)
	}

	orders, total, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil || total != 1 {
		t.Fatalf("expected 1 order from CSV, got %d, err: %v", total, err)
	}
	if orders[0].Customer != "RS Siloam" {
		t.Errorf("expected RS Siloam, got %q", orders[0].Customer)
	}
}
