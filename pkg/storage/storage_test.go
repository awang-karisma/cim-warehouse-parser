package storage_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
)

func createSampleData() ([]model.NormalizedItem, []model.Order) {
	items := []model.NormalizedItem{
		{
			RowIndex:           2,
			Tanggal:            model.ParseDate("02/01/2026"),
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
			Tanggal:            model.ParseDate("02/01/2026"),
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
			OrderNumber:        "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			EcatalogNumber:     "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Tanggal:            model.ParseDate("03/01/2026"),
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
			Tanggal:            model.ParseDate("04/01/2026"),
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
			Tanggal:  model.ParseDate("02/01/2026"),
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
			ID:             "ORD-0002",
			OrderNumber:    "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			EcatalogNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Tanggal:        model.ParseDate("03/01/2026"),
			Customer:       "RSUD Praya",
			Area:           "Lombok Tengah",
			Items: []model.OrderItem{
				{
					RowIndex:           4,
					OrderNumber:        "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
					EcatalogNumber:     "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
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
			Tanggal:  model.ParseDate("04/01/2026"),
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

	// Test GetOrderByID with OrderNumber / EcatalogNumber
	ordEP, err := store.GetOrderByID(ctx, "ORD-0002")
	if err != nil {
		t.Fatalf("GetOrderByID ORD-0002 failed: %v", err)
	}
	if ordEP.OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || ordEP.EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("ORD-0002 unexpected order numbers: %+v", ordEP)
	}
	if len(ordEP.Items) != 1 || ordEP.Items[0].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || ordEP.Items[0].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("ORD-0002 unexpected item order numbers: %+v", ordEP.Items)
	}

	// Test GetOrders - filter by OrderNumber
	epOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{OrderNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"})
	if err != nil {
		t.Fatalf("GetOrders OrderNumber failed: %v", err)
	}
	if total != 1 || len(epOrders) != 1 || epOrders[0].ID != "ORD-0002" {
		t.Fatalf("expected 1 order for OrderNumber filter, got len=%d total=%d", len(epOrders), total)
	}
	if epOrders[0].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || epOrders[0].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("unexpected epOrders: %+v", epOrders[0])
	}

	// Test GetOrders - filter by EcatalogNumber
	ecatOrders, total, err := store.GetOrders(ctx, storage.OrderFilter{EcatalogNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"})
	if err != nil {
		t.Fatalf("GetOrders EcatalogNumber failed: %v", err)
	}
	if total != 1 || len(ecatOrders) != 1 || ecatOrders[0].ID != "ORD-0002" {
		t.Fatalf("expected 1 order for EcatalogNumber filter, got len=%d total=%d", len(ecatOrders), total)
	}

	// Test GetItems - filter by OrderNumber
	epItems, total, err := store.GetItems(ctx, storage.ItemFilter{OrderNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"})
	if err != nil {
		t.Fatalf("GetItems OrderNumber failed: %v", err)
	}
	if total != 1 || len(epItems) != 1 || epItems[0].NamaBarang != "Needle 23G" {
		t.Fatalf("expected 1 item for OrderNumber filter, got len=%d total=%d", len(epItems), total)
	}
	if epItems[0].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || epItems[0].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("unexpected epItems: %+v", epItems[0])
	}

	// Test GetItems - filter by EcatalogNumber
	ecatItems, total, err := store.GetItems(ctx, storage.ItemFilter{EcatalogNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"})
	if err != nil {
		t.Fatalf("GetItems EcatalogNumber failed: %v", err)
	}
	if total != 1 || len(ecatItems) != 1 || ecatItems[0].NamaBarang != "Needle 23G" {
		t.Fatalf("expected 1 item for EcatalogNumber filter, got len=%d total=%d", len(ecatItems), total)
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
			Tanggal:  model.ParseDate("01/01/2026"),
		},
		{
			ID:       "ORD-DUPE", // Duplicate primary key
			Customer: "Cust 2",
			Tanggal:  model.ParseDate("01/01/2026"),
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
			Tanggal:    model.ParseDate("10/01/2026"),
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
			Tanggal:  model.ParseDate("10/01/2026"),
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
	if err := store.RecordSync(ctx, "ERROR", 0, 0, errMsg, 120); err != nil {
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

func TestHasSynced(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	synced, err := store.HasSynced(ctx)
	if err != nil {
		t.Fatalf("HasSynced failed on empty db: %v", err)
	}
	if synced {
		t.Error("expected HasSynced to be false on empty database")
	}

	// Record an ERROR sync - should still return false
	if err := store.RecordSync(ctx, "ERROR", 0, 0, "failed", 50); err != nil {
		t.Fatalf("RecordSync ERROR failed: %v", err)
	}
	synced, err = store.HasSynced(ctx)
	if err != nil {
		t.Fatalf("HasSynced failed after error sync: %v", err)
	}
	if synced {
		t.Error("expected HasSynced to be false after error sync")
	}

	// Record a SUCCESS sync
	if err := store.RecordSync(ctx, "SUCCESS", 10, 5, "", 200); err != nil {
		t.Fatalf("RecordSync SUCCESS failed: %v", err)
	}
	synced, err = store.HasSynced(ctx)
	if err != nil {
		t.Fatalf("HasSynced failed after success sync: %v", err)
	}
	if !synced {
		t.Error("expected HasSynced to be true after successful sync")
	}
}

func TestGetSyncHistory(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	// Empty
	records, total, err := store.GetSyncHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("GetSyncHistory failed: %v", err)
	}
	if total != 0 || len(records) != 0 {
		t.Fatalf("expected 0 records, got %d (total %d)", len(records), total)
	}

	// Insert 3 records
	_ = store.RecordSync(ctx, "SUCCESS", 5, 2, "", 100)
	_ = store.RecordSync(ctx, "ERROR", 0, 0, "fail", 50)
	_ = store.RecordSync(ctx, "SUCCESS", 10, 4, "", 150)

	records, total, err = store.GetSyncHistory(ctx, 2, 0)
	if err != nil {
		t.Fatalf("GetSyncHistory failed: %v", err)
	}
	if total != 3 {
		t.Fatalf("expected total 3, got %d", total)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	if records[0].DurationMs != 150 {
		t.Fatalf("expected duration 150 on latest record, got %d", records[0].DurationMs)
	}

	// Offset
	records, total, err = store.GetSyncHistory(ctx, 2, 2)
	if err != nil {
		t.Fatalf("GetSyncHistory with offset failed: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record at offset 2, got %d", len(records))
	}
}

func TestGetCustomersAndAreas(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Test GetCustomers
	custs, total, err := store.GetCustomers(ctx, "", "", 10, 0)
	if err != nil {
		t.Fatalf("GetCustomers failed: %v", err)
	}
	if total < 2 || len(custs) < 2 {
		t.Fatalf("expected at least 2 customers, got %d (total %d)", len(custs), total)
	}

	// Search customer
	custsSearch, totalSearch, err := store.GetCustomers(ctx, "Narmada", "", 10, 0)
	if err != nil {
		t.Fatalf("GetCustomers search failed: %v", err)
	}
	if totalSearch != 1 || custsSearch[0].Name != "RS Narmada" {
		t.Fatalf("expected 1 customer RS Narmada, got %d", totalSearch)
	}
	if custsSearch[0].TotalItems == 0 {
		t.Errorf("expected positive total items for customer")
	}

	// Test GetAreas
	areas, err := store.GetAreas(ctx)
	if err != nil {
		t.Fatalf("GetAreas failed: %v", err)
	}
	if len(areas) == 0 {
		t.Fatalf("expected areas, got 0")
	}
	if areas[0].Name == "" {
		t.Errorf("expected non-empty area name")
	}
	if areas[0].TotalOrders == 0 {
		t.Errorf("expected positive total orders for area")
	}
}

func TestSearchAll(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Search by item name
	res, err := store.SearchAll(ctx, "Yellowtip", "all", 10)
	if err != nil {
		t.Fatalf("SearchAll failed: %v", err)
	}
	if res.Items.Total == 0 {
		t.Errorf("expected at least 1 item matching Yellowtip")
	}
	if res.Orders.Total == 0 {
		t.Errorf("expected at least 1 order matching Yellowtip item")
	}

	// Search by customer name
	resCust, err := store.SearchAll(ctx, "Narmada", "customers", 10)
	if err != nil {
		t.Fatalf("SearchAll customers failed: %v", err)
	}
	if resCust.Customers.Total != 1 {
		t.Errorf("expected 1 customer matching Narmada, got %d", resCust.Customers.Total)
	}
}

func TestGetOrders_StatusFilter(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	ordersCompleted, total, err := store.GetOrders(ctx, storage.OrderFilter{Status: "COMPLETED"})
	if err != nil {
		t.Fatalf("GetOrders with status filter failed: %v", err)
	}
	if total == 0 || len(ordersCompleted) == 0 {
		t.Fatalf("expected orders with COMPLETED status, got 0")
	}

	// Filter with non-existent status
	ordersNone, totalNone, err := store.GetOrders(ctx, storage.OrderFilter{Status: "NON_EXISTENT_STATUS"})
	if err != nil {
		t.Fatalf("GetOrders with non-existent status failed: %v", err)
	}
	if totalNone != 0 || len(ordersNone) != 0 {
		t.Fatalf("expected 0 orders, got %d", totalNone)
	}
}

func TestGetTableStats(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items, orders := createSampleData()
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	stats, err := store.GetTableStats(ctx)
	if err != nil {
		t.Fatalf("GetTableStats failed: %v", err)
	}
	if stats["orders"].RowCount != len(orders) {
		t.Errorf("expected %d orders, got %d", len(orders), stats["orders"].RowCount)
	}
	if stats["items"].RowCount != len(items) {
		t.Errorf("expected %d items, got %d", len(items), stats["items"].RowCount)
	}
	if stats["sync_history"].RowCount != 1 {
		t.Errorf("expected 1 sync_history record, got %d", stats["sync_history"].RowCount)
	}
}

func TestStorage_AreaNormalizationAndCaseInsensitiveQuery(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	items := []model.NormalizedItem{
		{
			RowIndex:    2,
			Customer:    "RSUD Bima",
			Area:        "BIMA",
			NamaBarang:  "Alat Suntik",
			StatusOrder: "COMPLETED",
		},
		{
			RowIndex:    3,
			Customer:    "RS Selong",
			Area:        "Lombok TIMUR",
			NamaBarang:  "Infus",
			StatusOrder: "COMPLETED",
		},
	}
	orders := []model.Order{
		{
			ID:       "ORD-0001",
			Customer: "RSUD Bima",
			Area:     "BIMA",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Alat Suntik", StatusOrder: "COMPLETED"},
			},
		},
		{
			ID:       "ORD-0002",
			Customer: "RS Selong",
			Area:     "Lombok TIMUR",
			Items: []model.OrderItem{
				{RowIndex: 3, NamaBarang: "Infus", StatusOrder: "COMPLETED"},
			},
		},
	}

	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Verify stored areas were normalized upon sync
	ord1, err := store.GetOrderByID(ctx, "ORD-0001")
	if err != nil {
		t.Fatalf("GetOrderByID failed: %v", err)
	}
	if ord1.Area != "Bima" {
		t.Errorf("expected stored area 'Bima', got %q", ord1.Area)
	}

	ord2, err := store.GetOrderByID(ctx, "ORD-0002")
	if err != nil {
		t.Fatalf("GetOrderByID failed: %v", err)
	}
	if ord2.Area != "Lombok Timur" {
		t.Errorf("expected stored area 'Lombok Timur', got %q", ord2.Area)
	}

	// Test querying by various case variations of "Bima"
	bimaQueries := []string{"bima", "BIMA", "Bima", "  bima  ", "Bima "}
	for _, q := range bimaQueries {
		res, total, err := store.GetOrders(ctx, storage.OrderFilter{Area: q})
		if err != nil {
			t.Fatalf("GetOrders failed for query %q: %v", q, err)
		}
		if total != 1 || len(res) != 1 {
			t.Errorf("query %q: expected 1 order, got total=%d len=%d", q, total, len(res))
		} else if res[0].ID != "ORD-0001" {
			t.Errorf("query %q: expected ORD-0001, got %s", q, res[0].ID)
		}
	}

	// Test querying by various variations of "Lombok Timur"
	ltQueries := []string{"lombok timur", "LOMBOK TIMUR", "Lombok Timur", "Lombok TIMUR", "  Lombok Timur  ", "lotim"}
	for _, q := range ltQueries {
		res, total, err := store.GetOrders(ctx, storage.OrderFilter{Area: q})
		if err != nil {
			t.Fatalf("GetOrders failed for query %q: %v", q, err)
		}
		if total != 1 || len(res) != 1 {
			t.Errorf("query %q: expected 1 order, got total=%d len=%d", q, total, len(res))
		} else if res[0].ID != "ORD-0002" {
			t.Errorf("query %q: expected ORD-0002, got %s", q, res[0].ID)
		}
	}

	// Test GetCustomers with area filter variations
	custs, cTotal, err := store.GetCustomers(ctx, "", "bima", 10, 0)
	if err != nil {
		t.Fatalf("GetCustomers failed: %v", err)
	}
	if cTotal != 1 || len(custs) != 1 || custs[0].Name != "RSUD Bima" {
		t.Errorf("expected 1 customer RSUD Bima, got total=%d len=%d", cTotal, len(custs))
	}

	// Test GetAreas grouping
	areas, err := store.GetAreas(ctx)
	if err != nil {
		t.Fatalf("GetAreas failed: %v", err)
	}
	if len(areas) != 2 {
		t.Errorf("expected 2 distinct areas, got %d", len(areas))
	}
}

func TestStorage_CustomerAliases(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory store: %v", err)
	}
	defer store.Close()

	// 1. Validation checks on SetCustomerAlias
	if err := store.SetCustomerAlias(ctx, "", "RS PKU", "Lombok Barat"); err == nil {
		t.Errorf("expected error for empty alias")
	}
	if err := store.SetCustomerAlias(ctx, "RS PKU", "", "Lombok Barat"); err == nil {
		t.Errorf("expected error for empty canonical")
	}
	if err := store.SetCustomerAlias(ctx, "RS PKU", "RS PKU", "Lombok Barat"); err == nil {
		t.Errorf("expected error when alias exactly equals canonical")
	}
	if err := store.SetCustomerAlias(ctx, "RSUD NARMADA", "RSUD Narmada", ""); err != nil {
		t.Fatalf("expected case-only alias to succeed: %v", err)
	}

	// 2. Set aliases with linked area
	if err := store.SetCustomerAlias(ctx, "PKU Muhammadiyah Hospital", "RS PKU Muhammadiyah", "Lombok Barat"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}
	if err := store.SetCustomerAlias(ctx, "PKU Muhammadiyah", "RS PKU Muhammadiyah", "Lombok Barat"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}
	// Another canonical customer
	if err := store.SetCustomerAlias(ctx, "RSUD Tripat", "RSUD Patut Patuh Patju", "Lombok Barat"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}

	// 3. GetCustomerAliases
	aliasesMap, err := store.GetCustomerAliases(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliases failed: %v", err)
	}
	if len(aliasesMap) == 0 {
		t.Fatalf("expected aliases in map, got empty")
	}
	pkuEntry, ok := aliasesMap["pku muhammadiyah hospital"]
	if !ok || pkuEntry.Canonical != "RS PKU Muhammadiyah" || pkuEntry.Area != "Lombok Barat" {
		t.Errorf("unexpected entry for pku muhammadiyah hospital: %+v", pkuEntry)
	}

	// 4. GetCustomerAliasesGrouped
	groups, err := store.GetCustomerAliasesGrouped(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesGrouped failed: %v", err)
	}
	if len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %d", len(groups))
	}
	var pkuGroup *storage.CustomerAliasGroup
	for i := range groups {
		if groups[i].Canonical == "RS PKU Muhammadiyah" {
			pkuGroup = &groups[i]
			break
		}
	}
	if pkuGroup == nil || len(pkuGroup.Aliases) != 2 || pkuGroup.Area != "Lombok Barat" {
		t.Errorf("expected RS PKU Muhammadiyah group with 2 aliases and area 'Lombok Barat', got %+v", pkuGroup)
	}

	// 5. Test customerMatchPatterns via GetOrders, GetItems, GetCustomers, and SearchAll
	items := []model.NormalizedItem{
		{
			RowIndex:    2,
			Tanggal:     model.ParseDate("01/01/2026"),
			Customer:    "RS PKU Muhammadiyah",
			Area:        "Lombok Barat",
			NamaBarang:  "Alcohol Swab",
			Jumlah:      "10",
			StatusOrder: "SELESAI",
		},
	}
	orders := []model.Order{
		{
			ID:       "ORD-PKU-1",
			Tanggal:  model.ParseDate("01/01/2026"),
			Customer: "RS PKU Muhammadiyah",
			Area:     "Lombok Barat",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Alcohol Swab", Jumlah: "10", StatusOrder: "SELESAI"},
			},
		},
	}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Query by alias variant
	matchedOrders, totalOrd, err := store.GetOrders(ctx, storage.OrderFilter{Customer: "PKU Muhammadiyah Hospital"})
	if err != nil {
		t.Fatalf("GetOrders failed: %v", err)
	}
	if totalOrd != 1 || len(matchedOrders) != 1 || matchedOrders[0].Customer != "RS PKU Muhammadiyah" {
		t.Errorf("expected 1 order with canonical customer, got total=%d orders=%+v", totalOrd, matchedOrders)
	}

	matchedItems, totalItems, err := store.GetItems(ctx, storage.ItemFilter{Customer: "PKU Muhammadiyah"})
	if err != nil {
		t.Fatalf("GetItems failed: %v", err)
	}
	if totalItems != 1 || len(matchedItems) != 1 || matchedItems[0].Customer != "RS PKU Muhammadiyah" {
		t.Errorf("expected 1 item with canonical customer, got total=%d items=%+v", totalItems, matchedItems)
	}

	custs, totalCusts, err := store.GetCustomers(ctx, "Hospital", "", 10, 0)
	if err != nil {
		t.Fatalf("GetCustomers failed: %v", err)
	}
	if totalCusts != 1 || len(custs) != 1 || custs[0].Name != "RS PKU Muhammadiyah" {
		t.Errorf("expected 1 customer RS PKU Muhammadiyah, got total=%d custs=%+v", totalCusts, custs)
	}

	searchRes, err := store.SearchAll(ctx, "PKU Muhammadiyah", "all", 10)
	if err != nil {
		t.Fatalf("SearchAll failed: %v", err)
	}
	if searchRes.Orders.Total != 1 || searchRes.Items.Total != 1 || searchRes.Customers.Total != 1 {
		t.Errorf("expected search matches across orders/items/customers, got orders=%d items=%d custs=%d",
			searchRes.Orders.Total, searchRes.Items.Total, searchRes.Customers.Total)
	}

	// 6. DeleteCustomerAlias
	if err := store.DeleteCustomerAlias(ctx, "PKU Muhammadiyah Hospital"); err != nil {
		t.Fatalf("DeleteCustomerAlias failed: %v", err)
	}
	groupsAfter, err := store.GetCustomerAliasesGrouped(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesGrouped failed: %v", err)
	}
	for _, g := range groupsAfter {
		if g.Canonical == "RS PKU Muhammadiyah" {
			if len(g.Aliases) != 1 || g.Aliases[0] != "PKU Muhammadiyah" {
				t.Errorf("expected 1 remaining alias after delete, got %+v", g.Aliases)
			}
		}
	}
}

func TestStorage_SetCustomerAliasCanonicalizesExistingRows(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory store: %v", err)
	}
	defer store.Close()

	items := []model.NormalizedItem{
		{RowIndex: 1, Customer: "RSUD NARMADA", NamaBarang: "Item 1", StatusOrder: "SELESAI"},
		{RowIndex: 2, Customer: "RSUD Narmada", Area: "Lombok Barat", NamaBarang: "Item 2", StatusOrder: "PENDING"},
	}
	orders := []model.Order{
		{ID: "alias-order", Customer: "RSUD NARMADA", Items: []model.OrderItem{{RowIndex: 1}}},
		{ID: "canonical-order", Customer: "RSUD Narmada", Area: "Lombok Barat", Items: []model.OrderItem{{RowIndex: 2}}},
	}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}
	if err := store.SetCustomerAlias(ctx, "RSUD NARMADA", "RSUD Narmada", ""); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}

	customers, total, err := store.GetCustomers(ctx, "", "", 10, 0)
	if err != nil {
		t.Fatalf("GetCustomers failed: %v", err)
	}
	if total != 1 || len(customers) != 1 || customers[0].Name != "RSUD Narmada" || customers[0].TotalOrders != 2 || customers[0].TotalItems != 2 {
		t.Fatalf("expected one canonical customer with 2 orders and items, total=%d customers=%+v", total, customers)
	}
	if customers[0].StatusCounts["SELESAI"] != 1 || customers[0].StatusCounts["PENDING"] != 1 {
		t.Errorf("expected status counts merged under canonical customer, got %+v", customers[0].StatusCounts)
	}

	gotOrders, orderCount, err := store.GetOrders(ctx, storage.OrderFilter{Customer: "RSUD NARMADA"})
	if err != nil {
		t.Fatalf("GetOrders failed: %v", err)
	}
	if orderCount != 2 || len(gotOrders) != 2 {
		t.Fatalf("expected alias search to return both orders, total=%d orders=%+v", orderCount, gotOrders)
	}
	for _, order := range gotOrders {
		if order.Customer != "RSUD Narmada" || order.Area != "Lombok Barat" {
			t.Errorf("expected canonical customer and retained area, got %+v", order)
		}
	}
	gotItems, itemCount, err := store.GetItems(ctx, storage.ItemFilter{Customer: "RSUD NARMADA"})
	if err != nil {
		t.Fatalf("GetItems failed: %v", err)
	}
	if itemCount != 2 || len(gotItems) != 2 {
		t.Fatalf("expected alias search to return both items, total=%d items=%+v", itemCount, gotItems)
	}
	for _, item := range gotItems {
		if item.Customer != "RSUD Narmada" || item.Area != "Lombok Barat" {
			t.Errorf("expected canonical customer and inherited area, got %+v", item)
		}
	}
}
func TestStorage_DeliveriesSyncAndQuery(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory store: %v", err)
	}
	defer store.Close()

	// 1. Sync one item with split shipments: "07/01/2026 (3), 03/02/2026 (1)"
	// and another with plain date "05/01/2026", and another with blank date
	items := []model.NormalizedItem{
		{
			RowIndex:          2,
			Tanggal:           model.ParseDate("02/01/2026"),
			Customer:          "RSUD Provinsi NTB",
			Area:              "Mataram",
			NamaBarang:        "Needle 23G",
			Jumlah:            "4",
			Satuan:            "BOX",
			TanggalPengiriman: "07/01/2026 (3), 03/02/2026 (1)",
			JumlahTerkirim:    "4",
			BelumTerkirim:     "0",
			StatusOrder:       "SELESAI",
		},
		{
			RowIndex:          3,
			Tanggal:           model.ParseDate("02/01/2026"),
			Customer:          "RSUD Provinsi NTB",
			Area:              "Mataram",
			NamaBarang:        "Spuit 3cc",
			Jumlah:            "10",
			Satuan:            "BOX",
			TanggalPengiriman: "05/01/2026",
			JumlahTerkirim:    "10",
			BelumTerkirim:     "0",
			StatusOrder:       "SELESAI",
		},
		{
			RowIndex:          4,
			Tanggal:           model.ParseDate("02/01/2026"),
			Customer:          "RSUD Provinsi NTB",
			Area:              "Mataram",
			NamaBarang:        "Spuit 5cc",
			Jumlah:            "5",
			Satuan:            "BOX",
			TanggalPengiriman: "", // blank date -> 0 delivery rows
			JumlahTerkirim:    "0",
			BelumTerkirim:     "5",
			StatusOrder:       "PENDING",
		},
	}

	orders := []model.Order{
		{
			ID:       "ORD-DEL-1",
			Tanggal:  model.ParseDate("02/01/2026"),
			Customer: "RSUD Provinsi NTB",
			Area:     "Mataram",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Needle 23G", Jumlah: "4", TanggalPengiriman: items[0].TanggalPengiriman},
				{RowIndex: 3, NamaBarang: "Spuit 3cc", Jumlah: "10", TanggalPengiriman: items[1].TanggalPengiriman},
				{RowIndex: 4, NamaBarang: "Spuit 5cc", Jumlah: "5", TanggalPengiriman: ""},
			},
		},
	}

	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Verify original item table has 3 rows with unchanged date strings
	storedItems, totalItems, err := store.GetItems(ctx, storage.ItemFilter{})
	if err != nil || totalItems != 3 {
		t.Fatalf("expected 3 items, got %d (err: %v)", totalItems, err)
	}
	if storedItems[0].TanggalPengiriman != "07/01/2026 (3), 03/02/2026 (1)" {
		t.Errorf("original item tanggal_pengiriman altered: %s", storedItems[0].TanggalPengiriman)
	}

	// Verify deliveries: split item produced 2 rows, single date produced 1 row, blank produced 0. Total = 3
	deliveries, totalDel, err := store.GetDeliveries(ctx, storage.DeliveryFilter{})
	if err != nil {
		t.Fatalf("GetDeliveries failed: %v", err)
	}
	if totalDel != 3 || len(deliveries) != 3 {
		t.Fatalf("expected 3 delivery records, got total=%d len=%d", totalDel, len(deliveries))
	}

	// Check ordering and properties
	// Item with split shipments should have shipment_count = 2
	var needleDeliveries []storage.DeliveryItem
	for _, d := range deliveries {
		if d.Item.NamaBarang == "Needle 23G" {
			needleDeliveries = append(needleDeliveries, d)
		}
	}
	if len(needleDeliveries) != 2 {
		t.Fatalf("expected 2 deliveries for Needle 23G, got %d", len(needleDeliveries))
	}
	if needleDeliveries[0].DeliveryDate != "2026-01-07" || needleDeliveries[0].ShippedQuantity != "3" || needleDeliveries[0].ShipmentIndex != 0 || needleDeliveries[0].ShipmentCount != 2 {
		t.Errorf("unexpected first shipment: %+v", needleDeliveries[0])
	}
	if needleDeliveries[1].DeliveryDate != "2026-02-03" || needleDeliveries[1].ShippedQuantity != "1" || needleDeliveries[1].ShipmentIndex != 1 || needleDeliveries[1].ShipmentCount != 2 {
		t.Errorf("unexpected second shipment: %+v", needleDeliveries[1])
	}

	// Test pagination on deliveries
	page1, pTotal, err := store.GetDeliveries(ctx, storage.DeliveryFilter{Limit: 2, Offset: 0})
	if err != nil || pTotal != 3 || len(page1) != 2 {
		t.Errorf("expected pagination limit 2 to return 2 items with total 3, got len=%d total=%d", len(page1), pTotal)
	}

	// 2. Re-running sync replaces rather than duplicates
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("second SyncMirror failed: %v", err)
	}
	_, totalDelAfter, err := store.GetDeliveries(ctx, storage.DeliveryFilter{})
	if err != nil || totalDelAfter != 3 {
		t.Fatalf("expected 3 deliveries after resync, got %d", totalDelAfter)
	}
}

func TestStorage_DeliveriesMigrationBackfill(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "legacy.db")

	// Create store
	store1, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	// Directly insert item without deliveries (simulating legacy database before deliveries table)
	_, err = store1.DB().Exec(`
		INSERT INTO items (row_index, order_id, order_number, customer, area, nama_barang, jumlah, satuan, tanggal_pengiriman, status_order)
		VALUES (2, 'ORD-OLD', 'EP-123', 'RS Legacy', 'Mataram', 'Kapas', '10', 'ROLL', '10/01/2026 (5), 15/01/2026 (5)', 'SELESAI')
	`)
	if err != nil {
		t.Fatalf("failed to insert legacy item: %v", err)
	}
	// Delete deliveries for this item to simulate pre-migration state
	_, _ = store1.DB().Exec(`DELETE FROM deliveries`)
	store1.Close()

	// Reopen store to trigger migrate() backfill
	store2, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to reopen store: %v", err)
	}
	defer store2.Close()

	dels, total, err := store2.GetDeliveries(context.Background(), storage.DeliveryFilter{})
	if err != nil || total != 2 {
		t.Fatalf("expected 2 backfilled deliveries, got total=%d err=%v", total, err)
	}
	if dels[0].DeliveryDate != "2026-01-10" || dels[0].ShippedQuantity != "5" {
		t.Errorf("unexpected delivery 0: %+v", dels[0])
	}
	if dels[1].DeliveryDate != "2026-01-15" || dels[1].ShippedQuantity != "5" {
		t.Errorf("unexpected delivery 1: %+v", dels[1])
	}
}

func TestStorage_DeliveriesMigrationRepair(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "legacy_repair.db")

	// 1. Create store and populate legacy single-blob delivery (old buggy state)
	store1, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	res, err := store1.DB().Exec(`
		INSERT INTO items (row_index, order_id, order_number, customer, area, nama_barang, jumlah, satuan, tanggal_pengiriman, status_order)
		VALUES (1, 'ORD-BLOB', 'EP-BLOB', 'RS Blob', 'Mataram', 'Reagen', '100', 'BOX', '08/07/2026 (39 pack) 24/07/2026 (45 pack)', 'SELESAI')
	`)
	if err != nil {
		t.Fatalf("failed to insert item: %v", err)
	}
	itemID, _ := res.LastInsertId()

	// Insert buggy single row containing the raw blob as delivery_date
	_, err = store1.DB().Exec(`
		INSERT INTO deliveries (item_id, delivery_date, shipped_quantity, shipment_index)
		VALUES (?, '08/07/2026 (39 pack) 24/07/2026 (45 pack)', '', 0)
	`, itemID)
	if err != nil {
		t.Fatalf("failed to insert buggy delivery: %v", err)
	}
	store1.Close()

	// 2. Reopen store to trigger migrate() -> repairDeliveries()
	store2, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to reopen store: %v", err)
	}
	defer store2.Close()

	dels, total, err := store2.GetDeliveries(context.Background(), storage.DeliveryFilter{})
	if err != nil {
		t.Fatalf("GetDeliveries failed: %v", err)
	}
	if total != 2 || len(dels) != 2 {
		t.Fatalf("expected 2 repaired deliveries, got total=%d len=%d (%+v)", total, len(dels), dels)
	}
	if dels[0].DeliveryDate != "2026-07-08" || dels[0].ShippedQuantity != "39" || dels[0].ShipmentIndex != 0 || dels[0].ShipmentCount != 2 {
		t.Errorf("unexpected first repaired delivery: %+v", dels[0])
	}
	if dels[1].DeliveryDate != "2026-07-24" || dels[1].ShippedQuantity != "45" || dels[1].ShipmentIndex != 1 || dels[1].ShipmentCount != 2 {
		t.Errorf("unexpected second repaired delivery: %+v", dels[1])
	}

	// Test date filter works with both ISO and DD/MM/YYYY query strings
	byISO, _, err := store2.GetDeliveries(context.Background(), storage.DeliveryFilter{Date: "2026-07-08"})
	if err != nil || len(byISO) != 1 || byISO[0].DeliveryDate != "2026-07-08" {
		t.Errorf("expected 1 delivery matching ISO date 2026-07-08, got %+v", byISO)
	}
	byDDMM, _, err := store2.GetDeliveries(context.Background(), storage.DeliveryFilter{Date: "08/07/2026"})
	if err != nil || len(byDDMM) != 1 || byDDMM[0].DeliveryDate != "2026-07-08" {
		t.Errorf("expected 1 delivery matching DD/MM/YYYY date 08/07/2026, got %+v", byDDMM)
	}
}

func TestStorage_DeliveriesSyncMirrorRawBlobs(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "sync_raw_blobs.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	items := []model.NormalizedItem{
		{
			RowIndex:          2,
			Customer:          "RSUD Provinsi NTB",
			Area:              "Mataram",
			NamaBarang:        "Needle 23G",
			Jumlah:            "100",
			Satuan:            "pack",
			TanggalPengiriman: "08/07/2026 (39 pack) 24/07/2026 (45 pack)",
			StatusOrder:       "PROSES",
		},
		{
			RowIndex:          3,
			Customer:          "RSUD Praya",
			Area:              "Lombok Tengah",
			NamaBarang:        "Spuit 5cc",
			Jumlah:            "2000",
			Satuan:            "pcs",
			TanggalPengiriman: "07/10/2026(900pcs) 15/10/2026(1000pcs)",
			StatusOrder:       "PROSES",
		},
		{
			RowIndex:          4,
			Customer:          "RSUD Selong",
			Area:              "Lombok Timur",
			NamaBarang:        "Vaksin",
			Jumlah:            "10",
			Satuan:            "vial",
			TanggalPengiriman: "13/04/2026 (1VIAL), 16/04/2026 (5VIAL)",
			StatusOrder:       "PROSES",
		},
	}

	if err := store.SyncMirror(ctx, items, nil); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	dels, total, err := store.GetDeliveries(ctx, storage.DeliveryFilter{})
	if err != nil {
		t.Fatalf("GetDeliveries failed: %v", err)
	}
	if total != 6 || len(dels) != 6 {
		t.Fatalf("expected 6 total deliveries, got total=%d len=%d", total, len(dels))
	}

	// Assert chronological ordering:
	// 2026-04-13 (1), 2026-04-16 (5), 2026-07-08 (39), 2026-07-24 (45), 2026-10-07 (900), 2026-10-15 (1000)
	expectedDates := []string{
		"2026-04-13",
		"2026-04-16",
		"2026-07-08",
		"2026-07-24",
		"2026-10-07",
		"2026-10-15",
	}
	expectedQuantities := []string{
		"1",
		"5",
		"39",
		"45",
		"900",
		"1000",
	}

	for i, d := range dels {
		if d.DeliveryDate != expectedDates[i] {
			t.Errorf("delivery %d: expected date %s, got %s", i, expectedDates[i], d.DeliveryDate)
		}
		if d.ShippedQuantity != expectedQuantities[i] {
			t.Errorf("delivery %d: expected quantity %s, got %s", i, expectedQuantities[i], d.ShippedQuantity)
		}
		if d.ShipmentCount != 2 {
			t.Errorf("delivery %d: expected shipment count 2, got %d", i, d.ShipmentCount)
		}
	}
}

func TestDateMigration_LegacyDDMMYYYY(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "legacy_dates.db")

	// 1. Manually create legacy schema with TEXT tanggal and insert legacy dates
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to open raw sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE orders (
			id TEXT PRIMARY KEY,
			order_number TEXT,
			ecatalog_number TEXT,
			tanggal TEXT,
			customer TEXT,
			area TEXT,
			total_items INTEGER,
			updated_at DATETIME
		);
		CREATE TABLE items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			row_index INTEGER,
			order_id TEXT,
			order_number TEXT,
			ecatalog_number TEXT,
			tanggal TEXT,
			customer TEXT,
			area TEXT,
			nama_barang TEXT,
			jumlah TEXT,
			satuan TEXT,
			tanggal_pengiriman TEXT,
			lead_time_pengiriman TEXT,
			jumlah_terkirim TEXT,
			belum_terkirim TEXT,
			status_order TEXT,
			status_barang TEXT,
			keterangan TEXT,
			catatan TEXT
		);
		INSERT INTO orders (id, order_number, ecatalog_number, tanggal, customer, area, total_items)
		VALUES ('ORD-LEGACY-1', 'EP-1', '', '02/01/2026', 'RS Legacy', 'Mataram', 1),
		       ('ORD-LEGACY-BAD', 'EP-2', '', 'unparseable/date', 'RS Legacy Bad', 'Mataram', 1);

		INSERT INTO items (id, row_index, order_id, order_number, tanggal, customer, area, nama_barang, jumlah, satuan)
		VALUES (1, 2, 'ORD-LEGACY-1', 'EP-1', '02/01/2026', 'RS Legacy', 'Mataram', 'Spuit 3cc', '10', 'BOX'),
		       (2, 3, 'ORD-LEGACY-BAD', 'EP-2', 'unparseable/date', 'RS Legacy Bad', 'Mataram', 'Kapas', '5', 'ROLL');
	`)
	if err != nil {
		t.Fatalf("failed to setup legacy tables: %v", err)
	}
	db.Close()

	// 2. Open via storage.New() which runs migrate() and migrateTanggal()
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("storage.New failed on legacy db: %v", err)
	}
	defer store.Close()

	// Verify SQLite storage has migrated valid DD/MM/YYYY to ISO YYYY-MM-DD
	var rawTanggal string
	if err := store.DB().QueryRow("SELECT tanggal FROM orders WHERE id = 'ORD-LEGACY-1'").Scan(&rawTanggal); err != nil {
		t.Fatalf("failed to query raw tanggal from orders: %v", err)
	}
	if rawTanggal != "2026-01-02" {
		t.Errorf("expected migrated ISO date '2026-01-02', got %q", rawTanggal)
	}

	// Verify unparseable legacy value preserved verbatim
	var badTanggal string
	if err := store.DB().QueryRow("SELECT tanggal FROM orders WHERE id = 'ORD-LEGACY-BAD'").Scan(&badTanggal); err != nil {
		t.Fatalf("failed to query bad tanggal from orders: %v", err)
	}
	if badTanggal != "unparseable/date" {
		t.Errorf("expected preserved verbatim date 'unparseable/date', got %q", badTanggal)
	}

	// Verify GetOrders scans as typed Go date
	orders, total, err := store.GetOrders(context.Background(), storage.OrderFilter{OrderNumber: "EP-1"})
	if err != nil || total != 1 {
		t.Fatalf("GetOrders failed: total=%d err=%v", total, err)
	}
	expectedDate := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	if !orders[0].Tanggal.Equal(expectedDate) {
		t.Errorf("expected scanned date %v, got %v", expectedDate, orders[0].Tanggal)
	}

	// Verify JSON serialization emits date-only ISO YYYY-MM-DD
	jsonBytes, err := json.Marshal(orders[0])
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	if !strings.Contains(string(jsonBytes), `"tanggal":"2026-01-02"`) {
		t.Errorf("expected JSON to contain date-only ISO '\"tanggal\":\"2026-01-02\"', got: %s", string(jsonBytes))
	}

	// 3. Insert a new order with typed date via SyncMirror
	typedDate := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	newOrders := []model.Order{
		{
			ID:          "ORD-NEW-1",
			OrderNumber: "EP-NEW",
			Tanggal:     typedDate,
			Customer:    "RS Baru",
			Area:        "Mataram",
			Items: []model.OrderItem{
				{RowIndex: 10, NamaBarang: "Needle", Jumlah: "1"},
			},
		},
	}
	newItems := []model.NormalizedItem{
		{
			RowIndex:    10,
			OrderNumber: "EP-NEW",
			Tanggal:     typedDate,
			Customer:    "RS Baru",
			Area:        "Mataram",
			NamaBarang:  "Needle",
			Jumlah:      "1",
		},
	}
	if err := store.SyncMirror(context.Background(), newItems, newOrders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Verify SQLite stored canonical ISO date
	var storedNewDate string
	if err := store.DB().QueryRow("SELECT tanggal FROM orders WHERE id = 'ORD-NEW-1'").Scan(&storedNewDate); err != nil {
		t.Fatalf("failed to query stored date: %v", err)
	}
	if storedNewDate != "2026-10-17" {
		t.Errorf("expected SQLite canonical ISO date '2026-10-17', got %q", storedNewDate)
	}

	// Verify retrieval returns the exact same typed date
	retrieved, total, err := store.GetOrders(context.Background(), storage.OrderFilter{OrderNumber: "EP-NEW"})
	if err != nil || total != 1 {
		t.Fatalf("GetOrders for new order failed: %v", err)
	}
	if !retrieved[0].Tanggal.Equal(typedDate) {
		t.Errorf("expected retrieved date %v, got %v", typedDate, retrieved[0].Tanggal)
	}
}

func TestDateFilter_ISOAndLegacyAndInvalid(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "filter_dates.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	targetDate := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	items := []model.NormalizedItem{
		{
			RowIndex:    2,
			OrderNumber: "EP-17",
			Tanggal:     targetDate,
			Customer:    "RS Target",
			Area:        "Mataram",
			NamaBarang:  "Target Item",
			Jumlah:      "5",
		},
	}
	orders := []model.Order{
		{
			ID:          "ORD-17",
			OrderNumber: "EP-17",
			Tanggal:     targetDate,
			Customer:    "RS Target",
			Area:        "Mataram",
			Items: []model.OrderItem{
				{RowIndex: 2, NamaBarang: "Target Item", Jumlah: "5"},
			},
		},
	}
	if err := store.SyncMirror(context.Background(), items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	ctx := context.Background()

	// 1. Filter with ISO YYYY-MM-DD
	resISO, totalISO, err := store.GetOrders(ctx, storage.OrderFilter{Date: "2026-10-17"})
	if err != nil || totalISO != 1 || len(resISO) != 1 {
		t.Errorf("expected 1 match for ISO filter '2026-10-17', got total=%d err=%v", totalISO, err)
	}

	// 2. Filter with legacy DD/MM/YYYY
	resLegacy, totalLegacy, err := store.GetOrders(ctx, storage.OrderFilter{Date: "17/10/2026"})
	if err != nil || totalLegacy != 1 || len(resLegacy) != 1 {
		t.Errorf("expected 1 match for legacy filter '17/10/2026', got total=%d err=%v", totalLegacy, err)
	}

	// 3. Filter with non-matching date
	_, totalOther, err := store.GetOrders(ctx, storage.OrderFilter{Date: "2026-10-18"})
	if err != nil || totalOther != 0 {
		t.Errorf("expected 0 matches for non-matching date, got total=%d err=%v", totalOther, err)
	}

	// 4. Filter with invalid date input -> returns no matches
	_, totalInvalid, err := store.GetOrders(ctx, storage.OrderFilter{Date: "not-a-valid-date"})
	if err != nil || totalInvalid != 0 {
		t.Errorf("expected 0 matches for invalid date, got total=%d err=%v", totalInvalid, err)
	}

	// 5. Test same for GetItems
	itemsISO, iTotalISO, err := store.GetItems(ctx, storage.ItemFilter{Date: "2026-10-17"})
	if err != nil || iTotalISO != 1 || len(itemsISO) != 1 {
		t.Errorf("GetItems: expected 1 match for ISO date, got %d", iTotalISO)
	}
	itemsLegacy, iTotalLegacy, err := store.GetItems(ctx, storage.ItemFilter{Date: "17/10/2026"})
	if err != nil || iTotalLegacy != 1 || len(itemsLegacy) != 1 {
		t.Errorf("GetItems: expected 1 match for legacy date, got %d", iTotalLegacy)
	}
	_, iTotalInvalid, err := store.GetItems(ctx, storage.ItemFilter{Date: "invalid-date"})
	if err != nil || iTotalInvalid != 0 {
		t.Errorf("GetItems: expected 0 matches for invalid date, got %d", iTotalInvalid)
	}
}

func TestDumpCustomerAliasesSQL(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	// 1. Empty dump has header + table/index DDL + BEGIN/COMMIT, no INSERT
	dumpEmpty, err := store.DumpCustomerAliasesSQL(ctx)
	if err != nil {
		t.Fatalf("DumpCustomerAliasesSQL on empty store failed: %v", err)
	}
	if !strings.Contains(dumpEmpty, "BEGIN TRANSACTION;") || !strings.Contains(dumpEmpty, "COMMIT;") {
		t.Errorf("expected dump to contain transaction statements, got: %s", dumpEmpty)
	}
	if !strings.Contains(dumpEmpty, "CREATE TABLE IF NOT EXISTS customer_aliases") {
		t.Errorf("expected dump to contain CREATE TABLE, got: %s", dumpEmpty)
	}
	if strings.Contains(dumpEmpty, "INSERT INTO") {
		t.Errorf("expected no INSERT statements in empty dump, got: %s", dumpEmpty)
	}

	// 2. Dump with data including single quote escaping
	if err := store.SetCustomerAlias(ctx, "O'Brien Clinic", "Dr. O'Brien's Office", "West Area"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}
	if err := store.SetCustomerAlias(ctx, "RS PKU", "RS PKU Muhammadiyah", "Lombok Barat"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}

	dump, err := store.DumpCustomerAliasesSQL(ctx)
	if err != nil {
		t.Fatalf("DumpCustomerAliasesSQL failed: %v", err)
	}
	if !strings.Contains(dump, "O''Brien Clinic") || !strings.Contains(dump, "Dr. O''Brien''s Office") {
		t.Errorf("expected single quotes to be escaped with '', got: %s", dump)
	}
	if !strings.Contains(dump, "ON CONFLICT(alias) DO UPDATE") {
		t.Errorf("expected ON CONFLICT clause in INSERT, got: %s", dump)
	}

	flat, err := store.GetCustomerAliasesFlat(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
	}
	if len(flat) != 2 {
		t.Fatalf("expected 2 flat aliases, got %d", len(flat))
	}
}

func TestImportCustomerAliasesSQL_Merge(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	if err := store.SetCustomerAlias(ctx, "Alias A", "Canonical A", "Area A"); err != nil {
		t.Fatalf("seed SetCustomerAlias failed: %v", err)
	}

	sqlDump := `
BEGIN TRANSACTION;
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Alias B', 'Canonical B', 'Area B') ON CONFLICT(alias) DO UPDATE SET canonical=excluded.canonical, area=excluded.area;
COMMIT;
`
	res, err := store.ImportCustomerAliasesSQL(ctx, sqlDump, "merge")
	if err != nil {
		t.Fatalf("ImportCustomerAliasesSQL merge failed: %v", err)
	}
	if res.Imported != 1 || res.Skipped != 0 {
		t.Errorf("expected 1 imported, 0 skipped, got %+v", res)
	}

	flat, err := store.GetCustomerAliasesFlat(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
	}
	if len(flat) != 2 {
		t.Fatalf("expected merge to retain existing alias (total 2), got %d: %+v", len(flat), flat)
	}
}

func TestImportCustomerAliasesSQL_Replace(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	if err := store.SetCustomerAlias(ctx, "Alias Old", "Canonical Old", "Area Old"); err != nil {
		t.Fatalf("seed SetCustomerAlias failed: %v", err)
	}

	sqlDump := `
BEGIN TRANSACTION;
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Alias New', 'Canonical New', 'Area New');
COMMIT;
`
	res, err := store.ImportCustomerAliasesSQL(ctx, sqlDump, "replace")
	if err != nil {
		t.Fatalf("ImportCustomerAliasesSQL replace failed: %v", err)
	}
	if res.Imported != 1 || res.Skipped != 0 {
		t.Errorf("expected 1 imported, 0 skipped, got %+v", res)
	}

	flat, err := store.GetCustomerAliasesFlat(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
	}
	if len(flat) != 1 || flat[0].Alias != "Alias New" {
		t.Fatalf("expected replace to clear old aliases and retain only 'Alias New', got: %+v", flat)
	}
}

func TestImportCustomerAliasesSQL_EscapingAndSkipped(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	sqlDump := `
+-- Test dump with escaped quotes, invalid equal-to-canonical row, and dedup last-wins
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('O''Brien Clinic', 'Dr. O''Brien', 'West Area');
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Self Equal', 'Self Equal', 'Area X');
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Dedup Alias', 'First Canonical', 'Area 1');
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('DEDUP ALIAS', 'Final Canonical', 'Area 2');
`
	res, err := store.ImportCustomerAliasesSQL(ctx, sqlDump, "merge")
	if err != nil {
		t.Fatalf("ImportCustomerAliasesSQL failed: %v", err)
	}
	// O'Brien Clinic (1) + Dedup Alias (1, last-wins) = 2 imported.
	// Self Equal (1) skipped.
	if res.Imported != 2 || res.Skipped != 1 {
		t.Fatalf("expected 2 imported, 1 skipped, got %+v", res)
	}
	if len(res.Errors) != 1 {
		t.Errorf("expected 1 error explanation for skipped row, got: %+v", res.Errors)
	}

	flat, err := store.GetCustomerAliasesFlat(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
	}
	if len(flat) != 2 {
		t.Fatalf("expected 2 flat aliases, got %d", len(flat))
	}
	foundOBrien := false
	foundDedup := false
	for _, a := range flat {
		if a.Alias == "O'Brien Clinic" && a.Canonical == "Dr. O'Brien" {
			foundOBrien = true
		}
		if strings.EqualFold(a.Alias, "Dedup Alias") && a.Canonical == "Final Canonical" {
			foundDedup = true
		}
	}
	if !foundOBrien {
		t.Errorf("expected unescaped single quote O'Brien Clinic in database, got: %+v", flat)
	}
	if !foundDedup {
		t.Errorf("expected dedup last-wins 'Final Canonical' in database, got: %+v", flat)
	}
}

func TestImportCustomerAliasesSQL_CascadeToOrdersAndItems(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	items := []model.NormalizedItem{
		{RowIndex: 1, Customer: "RS VARIANT", NamaBarang: "Item 1", StatusOrder: "SELESAI"},
		{RowIndex: 2, Customer: "RS Canonical", Area: "Lombok Barat", NamaBarang: "Item 2", StatusOrder: "PENDING"},
	}
	orders := []model.Order{
		{ID: "ord-1", Customer: "RS VARIANT", Items: []model.OrderItem{{RowIndex: 1}}},
		{ID: "ord-2", Customer: "RS Canonical", Area: "Lombok Barat", Items: []model.OrderItem{{RowIndex: 2}}},
	}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	sqlDump := `
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('RS VARIANT', 'RS Canonical', '');
`
	res, err := store.ImportCustomerAliasesSQL(ctx, sqlDump, "merge")
	if err != nil {
		t.Fatalf("ImportCustomerAliasesSQL failed: %v", err)
	}
	if res.Imported != 1 {
		t.Fatalf("expected 1 imported, got %+v", res)
	}

	gotOrders, totalOrders, err := store.GetOrders(ctx, storage.OrderFilter{Customer: "RS Canonical"})
	if err != nil {
		t.Fatalf("GetOrders failed: %v", err)
	}
	if totalOrders != 2 || len(gotOrders) != 2 {
		t.Fatalf("expected both orders under canonical customer, total=%d, orders=%+v", totalOrders, gotOrders)
	}
	for _, o := range gotOrders {
		if o.Customer != "RS Canonical" || o.Area != "Lombok Barat" {
			t.Errorf("expected canonical customer and linked area 'Lombok Barat', got %+v", o)
		}
	}
}

func TestImportCustomerAliasesSQL_SecurityAndInvalidMode(t *testing.T) {
	ctx := context.Background()
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	defer store.Close()

	// 1. Invalid mode returns error
	if _, err := store.ImportCustomerAliasesSQL(ctx, "BEGIN; COMMIT;", "bad_mode"); err == nil {
		t.Errorf("expected error on invalid mode")
	}

	// 2. Dangerous SQL statements (DROP TABLE, CREATE TABLE evil) must be ignored, only customer_aliases imported
	maliciousSQL := `
DROP TABLE orders;
CREATE TABLE evil (id int);
INSERT INTO evil VALUES (1);
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Safe Alias', 'Safe Canonical', 'Safe Area');
`
	res, err := store.ImportCustomerAliasesSQL(ctx, maliciousSQL, "merge")
	if err != nil {
		t.Fatalf("ImportCustomerAliasesSQL failed: %v", err)
	}
	if res.Imported != 1 {
		t.Fatalf("expected safe alias to be imported, got %+v", res)
	}

	// Verify orders table still exists and evil table does not
	if _, _, err := store.GetOrders(ctx, storage.OrderFilter{}); err != nil {
		t.Errorf("orders table should still exist, got: %v", err)
	}

	// 3. SQL with no customer_aliases statements but containing INSERT returns 0 imported with specific error
	noAliasesSQL := `
INSERT INTO some_other_table VALUES ('foo', 'bar');
`
	resNoAliases, err := store.ImportCustomerAliasesSQL(ctx, noAliasesSQL, "merge")
	if err != nil {
		t.Fatalf("expected nil error from storage on no valid aliases, got: %v", err)
	}
	if resNoAliases.Imported != 0 || len(resNoAliases.Errors) == 0 {
		t.Errorf("expected 0 imported and descriptive error message, got %+v", resNoAliases)
	}
}
