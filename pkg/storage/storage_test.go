package storage_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
)

func createSampleData() ([]model.NormalizedItem, []model.Order) {
	items := []model.NormalizedItem{
		{
			RowIndex:           2,
			Tanggal:            "02/01/2026",
			Customer:           "RS Narmada",
			Area:               "Lombok Barat",
			NamaBarang:         "Yellowtip",
			Jumlah:             "6",
			Satuan:             "SAK",
			TanggalPengiriman:  "02/01/2026",
			LeadTimePengiriman: "0",
			JumlahTerkirim:     "6",
			BelumTerkirim:      "0",
			StatusOrder:        "COMPLETED",
			StatusBarang:       "READY",
			Keterangan:         "Sudah Diterima",
			Catatan:            "Pengiriman aman",
		},
		{
			RowIndex:           3,
			Tanggal:            "02/01/2026",
			Customer:           "RS Narmada",
			Area:               "Lombok Barat",
			NamaBarang:         "Bluetip",
			Jumlah:             "4",
			Satuan:             "BOX",
			TanggalPengiriman:  "02/01/2026",
			LeadTimePengiriman: "0",
			JumlahTerkirim:     "4",
			BelumTerkirim:      "0",
			StatusOrder:        "COMPLETED",
			StatusBarang:       "READY",
			Keterangan:         "Sudah Diterima",
			Catatan:            "",
		},
		{
			RowIndex:           4,
			Tanggal:            "03/01/2026",
			Customer:           "RSUD Praya",
			Area:               "Lombok Tengah",
			NamaBarang:         "Needle 23G",
			Jumlah:             "10",
			Satuan:             "BOX",
			TanggalPengiriman:  "",
			LeadTimePengiriman: "",
			JumlahTerkirim:     "0",
			BelumTerkirim:      "10",
			StatusOrder:        "PENDING",
			StatusBarang:       "STOK KOSONG",
			Keterangan:         "Menunggu stok",
			Catatan:            "Prioritas",
		},
		{
			RowIndex:           5,
			Tanggal:            "04/01/2026",
			Customer:           "Klinik Surya",
			Area:               "Mataram",
			NamaBarang:         "Spuit 3cc",
			Jumlah:             "20",
			Satuan:             "BOX",
			TanggalPengiriman:  "05/01/2026",
			LeadTimePengiriman: "1",
			JumlahTerkirim:     "10",
			BelumTerkirim:      "10",
			StatusOrder:        "PARTIAL",
			StatusBarang:       "READY",
			Keterangan:         "Terkirim Sebagian",
			Catatan:            "",
		},
	}

	orders := []model.Order{
		{
			ID:       "ORD-0001",
			Tanggal:  "02/01/2026",
			Customer: "RS Narmada",
			Area:     "Lombok Barat",
			Items: []model.OrderItem{
				{
					RowIndex:           2,
					NamaBarang:         "Yellowtip",
					Jumlah:             "6",
					Satuan:             "SAK",
					TanggalPengiriman:  "02/01/2026",
					LeadTimePengiriman: "0",
					JumlahTerkirim:     "6",
					BelumTerkirim:      "0",
					StatusOrder:        "COMPLETED",
					StatusBarang:       "READY",
					Keterangan:         "Sudah Diterima",
					Catatan:            "Pengiriman aman",
				},
				{
					RowIndex:           3,
					NamaBarang:         "Bluetip",
					Jumlah:             "4",
					Satuan:             "BOX",
					TanggalPengiriman:  "02/01/2026",
					LeadTimePengiriman: "0",
					JumlahTerkirim:     "4",
					BelumTerkirim:      "0",
					StatusOrder:        "COMPLETED",
					StatusBarang:       "READY",
					Keterangan:         "Sudah Diterima",
					Catatan:            "",
				},
			},
		},
		{
			ID:       "ORD-0002",
			Tanggal:  "03/01/2026",
			Customer: "RSUD Praya",
			Area:     "Lombok Tengah",
			Items: []model.OrderItem{
				{
					RowIndex:           4,
					NamaBarang:         "Needle 23G",
					Jumlah:             "10",
					Satuan:             "BOX",
					TanggalPengiriman:  "",
					LeadTimePengiriman: "",
					JumlahTerkirim:     "0",
					BelumTerkirim:      "10",
					StatusOrder:        "PENDING",
					StatusBarang:       "STOK KOSONG",
					Keterangan:         "Menunggu stok",
					Catatan:            "Prioritas",
				},
			},
		},
		{
			ID:       "ORD-0003",
			Tanggal:  "04/01/2026",
			Customer: "Klinik Surya",
			Area:     "Mataram",
			Items: []model.OrderItem{
				{
					RowIndex:           5,
					NamaBarang:         "Spuit 3cc",
					Jumlah:             "20",
					Satuan:             "BOX",
					TanggalPengiriman:  "05/01/2026",
					LeadTimePengiriman: "1",
					JumlahTerkirim:     "10",
					BelumTerkirim:      "10",
					StatusOrder:        "PARTIAL",
					StatusBarang:       "READY",
					Keterangan:         "Terkirim Sebagian",
					Catatan:            "",
				},
			},
		},
	}

	return items, orders
}

func TestNew_Memory(t *testing.T) {
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory storage: %v", err)
	}
	defer store.Close()

	if store.DB() == nil {
		t.Fatal("expected non-nil DB handle")
	}

	// Verify tables created
	tables := []string{"orders", "items", "sync_history"}
	for _, tbl := range tables {
		var name string
		err := store.DB().QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", tbl).Scan(&name)
		if err != nil {
			t.Errorf("table %q was not created: %v", tbl, err)
		}
	}
}

func TestNew_File(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "warehouse.db")

	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create file storage: %v", err)
	}
	defer store.Close()

	// Verify WAL mode
	var journalMode string
	if err := store.DB().QueryRow("PRAGMA journal_mode;").Scan(&journalMode); err != nil {
		t.Fatalf("failed to query journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Errorf("expected journal_mode 'wal', got %q", journalMode)
	}

	// Verify DB file exists
	if _, err := os.Stat(dbPath); err != nil {
		t.Errorf("db file does not exist: %v", err)
	}
}

func TestSyncMirror_AndQueries(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Initial sync history should be empty
	lastSync, err := store.GetLastSync(ctx)
	if err != nil {
		t.Fatalf("unexpected error on empty sync_history: %v", err)
	}
	if lastSync != nil {
		t.Fatalf("expected nil sync record on fresh db, got %+v", lastSync)
	}

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Verify GetLastSync
	lastSync, err = store.GetLastSync(ctx)
	if err != nil {
		t.Fatalf("GetLastSync failed: %v", err)
	}
	if lastSync == nil {
		t.Fatal("expected non-nil last sync record")
	}
	if lastSync.Status != "SUCCESS" {
		t.Errorf("expected status 'SUCCESS', got %q", lastSync.Status)
	}
	if lastSync.OrdersCount != 3 {
		t.Errorf("expected 3 orders count, got %d", lastSync.OrdersCount)
	}
	if lastSync.ItemsCount != 4 {
		t.Errorf("expected 4 items count, got %d", lastSync.ItemsCount)
	}

	// Test GetStats
	stats, err := store.GetStats(ctx)
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}
	if stats.TotalOrders != 3 {
		t.Errorf("expected 3 total orders, got %d", stats.TotalOrders)
	}
	if stats.TotalItems != 4 {
		t.Errorf("expected 4 total items, got %d", stats.TotalItems)
	}
	if stats.UniqueCustomers != 3 {
		t.Errorf("expected 3 unique customers, got %d", stats.UniqueCustomers)
	}
	if stats.StatusCounts["COMPLETED"] != 2 {
		t.Errorf("expected 2 COMPLETED items, got %d", stats.StatusCounts["COMPLETED"])
	}
	if stats.StatusCounts["PENDING"] != 1 {
		t.Errorf("expected 1 PENDING item, got %d", stats.StatusCounts["PENDING"])
	}
	if stats.StatusCounts["PARTIAL"] != 1 {
		t.Errorf("expected 1 PARTIAL item, got %d", stats.StatusCounts["PARTIAL"])
	}

	// Test GetOrders - no filter
	allOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil {
		t.Fatalf("GetOrders all failed: %v", err)
	}
	if total != 3 || len(allOrders) != 3 {
		t.Fatalf("expected 3 orders, got len=%d total=%d", len(allOrders), total)
	}

	// Test GetOrders - filter by Customer
	custOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{Customer: "Narmada"})
	if err != nil {
		t.Fatalf("GetOrders customer failed: %v", err)
	}
	if total != 1 || len(custOrders) != 1 {
		t.Fatalf("expected 1 order for Narmada, got len=%d total=%d", len(custOrders), total)
	}
	if custOrders[0].Customer != "RS Narmada" {
		t.Errorf("expected RS Narmada, got %q", custOrders[0].Customer)
	}
	if len(custOrders[0].Items) != 2 {
		t.Errorf("expected 2 items in RS Narmada order, got %d", len(custOrders[0].Items))
	}

	// Test GetOrders - filter by Date
	dateOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{Date: "03/01/2026"})
	if err != nil {
		t.Fatalf("GetOrders date failed: %v", err)
	}
	if total != 1 || len(dateOrders) != 1 {
		t.Fatalf("expected 1 order for date, got len=%d total=%d", len(dateOrders), total)
	}
	if dateOrders[0].ID != "ORD-0002" {
		t.Errorf("expected ORD-0002, got %q", dateOrders[0].ID)
	}

	// Test GetOrders - filter by Area
	areaOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{Area: "Mataram"})
	if err != nil {
		t.Fatalf("GetOrders area failed: %v", err)
	}
	if total != 1 || len(areaOrders) != 1 {
		t.Fatalf("expected 1 order for Mataram, got len=%d total=%d", len(areaOrders), total)
	}

	// Test GetOrders - Pagination
	pagedOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{Limit: 2, Offset: 1})
	if err != nil {
		t.Fatalf("GetOrders paged failed: %v", err)
	}
	if total != 3 {
		t.Errorf("expected total=3, got %d", total)
	}
	if len(pagedOrders) != 2 {
		t.Fatalf("expected 2 paged orders, got %d", len(pagedOrders))
	}
	if pagedOrders[0].ID != "ORD-0002" || pagedOrders[1].ID != "ORD-0003" {
		t.Errorf("unexpected paged order IDs: %v, %v", pagedOrders[0].ID, pagedOrders[1].ID)
	}

	// Test GetOrderByID
	ord, err := store.GetOrderByID(ctx, "ORD-0001")
	if err != nil {
		t.Fatalf("GetOrderByID failed: %v", err)
	}
	if ord.ID != "ORD-0001" || ord.Customer != "RS Narmada" {
		t.Errorf("unexpected order data: %+v", ord)
	}
	if len(ord.Items) != 2 {
		t.Fatalf("expected 2 items in order ORD-0001, got %d", len(ord.Items))
	}
	if ord.Items[0].NamaBarang != "Yellowtip" || ord.Items[1].NamaBarang != "Bluetip" {
		t.Errorf("unexpected order items: %+v", ord.Items)
	}

	// Test GetOrderByID - Not Found
	_, err = store.GetOrderByID(ctx, "ORD-9999")
	if err == nil {
		t.Fatal("expected error for non-existent order, got nil")
	}

	// Test GetItems - no filter
	allItems, total, err := store.GetItems(ctx, storage.ItemFilter{})
	if err != nil {
		t.Fatalf("GetItems all failed: %v", err)
	}
	if total != 4 || len(allItems) != 4 {
		t.Fatalf("expected 4 items, got len=%d total=%d", len(allItems), total)
	}

	// Test GetItems - filter by NamaBarang
	itemFilterNama, total, err := store.GetItems(ctx, storage.ItemFilter{NamaBarang: "Needle"})
	if err != nil {
		t.Fatalf("GetItems NamaBarang failed: %v", err)
	}
	if total != 1 || len(itemFilterNama) != 1 {
		t.Fatalf("expected 1 item, got %d", total)
	}
	if itemFilterNama[0].NamaBarang != "Needle 23G" {
		t.Errorf("expected Needle 23G, got %q", itemFilterNama[0].NamaBarang)
	}

	// Test GetItems - filter by StatusOrder
	itemFilterStatus, total, err := store.GetItems(ctx, storage.ItemFilter{StatusOrder: "COMPLETED"})
	if err != nil {
		t.Fatalf("GetItems StatusOrder failed: %v", err)
	}
	if total != 2 || len(itemFilterStatus) != 2 {
		t.Fatalf("expected 2 completed items, got %d", total)
	}

	// Test GetItems - pagination
	itemPaged, total, err := store.GetItems(ctx, storage.ItemFilter{Limit: 2, Offset: 2})
	if err != nil {
		t.Fatalf("GetItems pagination failed: %v", err)
	}
	if total != 4 {
		t.Errorf("expected total=4, got %d", total)
	}
	if len(itemPaged) != 2 {
		t.Fatalf("expected 2 items, got %d", len(itemPaged))
	}
}

func TestSyncMirror_AtomicRollback(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("initial SyncMirror failed: %v", err)
	}

	// Verify initial count
	initialOrders, initialCount, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil || initialCount != 3 {
		t.Fatalf("expected 3 initial orders, got %d, err: %v", initialCount, err)
	}

	// Create invalid payload with duplicate primary key order ID to induce a SQL error
	invalidOrders := []model.Order{
		{
			ID:       "ORD-DUPE",
			Customer: "Cust 1",
			Tanggal:  "01/01/2026",
		},
		{
			ID:       "ORD-DUPE", // Duplicate primary key
			Customer: "Cust 2",
			Tanggal:  "01/01/2026",
		},
	}
	invalidItems := []model.NormalizedItem{
		{RowIndex: 10, Customer: "Cust 1", NamaBarang: "Item 1"},
	}

	err = store.SyncMirror(ctx, invalidItems, invalidOrders)
	if err == nil {
		t.Fatal("expected SyncMirror to fail on duplicate primary key, but it succeeded")
	}

	// Verify atomic rollback: previous data must remain completely intact
	afterOrders, afterCount, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil {
		t.Fatalf("GetOrders after rollback failed: %v", err)
	}
	if afterCount != initialCount {
		t.Fatalf("atomic rollback violated: expected %d orders, got %d", initialCount, afterCount)
	}
	for i := range initialOrders {
		if afterOrders[i].ID != initialOrders[i].ID {
			t.Errorf("order %d ID mismatch: expected %q, got %q", i, initialOrders[i].ID, afterOrders[i].ID)
		}
	}

	// Verify items count is also intact
	_, itemCount, err := store.GetItems(ctx, storage.ItemFilter{})
	if err != nil || itemCount != len(items) {
		t.Fatalf("expected %d items intact, got %d, err: %v", len(items), itemCount, err)
	}
}

func TestSyncMirror_MirrorOverwritesPrevious(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("first SyncMirror failed: %v", err)
	}

	// Now sync a completely new snapshot with 1 order and 1 item
	newItems := []model.NormalizedItem{
		{
			RowIndex:   2,
			Tanggal:    "10/01/2026",
			Customer:   "RS Baru",
			Area:       "Denpasar",
			NamaBarang: "Alkohol 70%",
			Jumlah:     "5",
			Satuan:     "JERIGEN",
		},
	}
	newOrders := []model.Order{
		{
			ID:       "ORD-0099",
			Tanggal:  "10/01/2026",
			Customer: "RS Baru",
			Area:     "Denpasar",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Alkohol 70%", Jumlah: "5", Satuan: "JERIGEN"},
			},
		},
	}

	if err := store.SyncMirror(ctx, newItems, newOrders); err != nil {
		t.Fatalf("second SyncMirror failed: %v", err)
	}

	ordersResult, total, err := store.GetOrders(ctx, storage.OrderFilter{})
	if err != nil {
		t.Fatalf("GetOrders failed: %v", err)
	}
	if total != 1 || len(ordersResult) != 1 {
		t.Fatalf("expected exactly 1 mirrored order, got %d", total)
	}
	if ordersResult[0].ID != "ORD-0099" {
		t.Errorf("expected ORD-0099, got %q", ordersResult[0].ID)
	}

	itemsResult, totalItems, err := store.GetItems(ctx, storage.ItemFilter{})
	if err != nil {
		t.Fatalf("GetItems failed: %v", err)
	}
	if totalItems != 1 || len(itemsResult) != 1 {
		t.Fatalf("expected exactly 1 mirrored item, got %d", totalItems)
	}
	if itemsResult[0].Customer != "RS Baru" {
		t.Errorf("expected RS Baru, got %q", itemsResult[0].Customer)
	}
}

func TestRecordSync(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	errMsg := "connection timeout to Google Sheets API"
	if err := store.RecordSync(ctx, "ERROR", 0, 0, errMsg); err != nil {
		t.Fatalf("RecordSync failed: %v", err)
	}

	rec, err := store.GetLastSync(ctx)
	if err != nil {
		t.Fatalf("GetLastSync failed: %v", err)
	}
	if rec == nil {
		t.Fatal("expected non-nil sync record")
	}
	if rec.Status != "ERROR" {
		t.Errorf("expected status 'ERROR', got %q", rec.Status)
	}
	if rec.ErrorMessage != errMsg {
		t.Errorf("expected error message %q, got %q", errMsg, rec.ErrorMessage)
	}
}
