package storage_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
)

func newTestStorage(t *testing.T) *storage.Storage {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test_delivery.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})
	return store
}

func TestDeliveryCandidateOrders(t *testing.T) {
	ctx := context.Background()
	store := newTestStorage(t)

	// Sync mirror with some orders:
	// Order 1: ORD-1 in Lombok Barat, Customer A, 1 finished item ("SELESAI"), 1 unfinished item ("BELUM SELESAI") -> Candidate!
	// Order 2: ORD-2 in Mataram, Customer B, all items "SELESAI" -> Not a candidate!
	// Order 3: ORD-3 in Lombok Timur, Customer C, 1 item "BATAL" -> Not a candidate!
	// Order 4: ORD-4 in Mataram, Customer D, 1 item "PROSES" -> Candidate!
	orders := []model.Order{
		{
			ID:             "ORD-0001",
			OrderNumber:    "ORD-0001",
			EcatalogNumber: "EP-001",
			Tanggal:        model.ParseDate("01/02/2026"),
			Customer:       "Customer A",
			Area:           "Lombok Barat",
			Items: []model.OrderItem{
				{
					RowIndex:      2,
					NamaBarang:    "Spuit 5cc",
					Jumlah:        "10",
					BelumTerkirim: "0",
					StatusOrder:   "SELESAI",
					StatusBarang:  "STOK GUDANG",
				},
				{
					RowIndex:      3,
					NamaBarang:    "Needle 21G",
					Jumlah:        "20",
					BelumTerkirim: "15",
					StatusOrder:   "BELUM SELESAI",
					StatusBarang:  "STOK GUDANG",
					Keterangan:    "Kirim bertahap",
				},
			},
		},
		{
			ID:             "ORD-0002",
			OrderNumber:    "ORD-0002",
			EcatalogNumber: "EP-002",
			Tanggal:        model.ParseDate("02/02/2026"),
			Customer:       "Customer B",
			Area:           "Mataram",
			Items: []model.OrderItem{
				{
					RowIndex:      4,
					NamaBarang:    "Infus Set",
					Jumlah:        "5",
					BelumTerkirim: "0",
					StatusOrder:   "SELESAI",
					StatusBarang:  "STOK GUDANG",
				},
			},
		},
		{
			ID:             "ORD-0003",
			OrderNumber:    "ORD-0003",
			EcatalogNumber: "EP-003",
			Tanggal:        model.ParseDate("03/02/2026"),
			Customer:       "Customer C",
			Area:           "Lombok Timur",
			Items: []model.OrderItem{
				{
					RowIndex:      5,
					NamaBarang:    "Abocath 20",
					Jumlah:        "10",
					BelumTerkirim: "10",
					StatusOrder:   "BATAL",
					StatusBarang:  "STOK KOSONG",
				},
			},
		},
		{
			ID:             "ORD-0004",
			OrderNumber:    "ORD-0004",
			EcatalogNumber: "EP-004",
			Tanggal:        model.ParseDate("01/02/2026"),
			Customer:       "Customer D",
			Area:           "Mataram",
			Items: []model.OrderItem{
				{
					RowIndex:      6,
					NamaBarang:    "Alcohol Swabs",
					Jumlah:        "50",
					BelumTerkirim: "50",
					StatusOrder:   "PROSES",
					StatusBarang:  "STOK GUDANG",
				},
			},
		},
	}

	items := []model.NormalizedItem{}
	for _, ord := range orders {
		for _, oi := range ord.Items {
			items = append(items, model.NormalizedItem{
				RowIndex:       oi.RowIndex,
				Tanggal:        ord.Tanggal,
				Customer:       ord.Customer,
				Area:           ord.Area,
				NamaBarang:     oi.NamaBarang,
				Jumlah:         oi.Jumlah,
				BelumTerkirim:  oi.BelumTerkirim,
				StatusOrder:    oi.StatusOrder,
				StatusBarang:   oi.StatusBarang,
				Keterangan:     oi.Keterangan,
				Catatan:        oi.Catatan,
				OrderNumber:    ord.OrderNumber,
				EcatalogNumber: ord.EcatalogNumber,
			})
		}
	}

	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("failed to sync mirror: %v", err)
	}

	candidates, err := store.GetDeliveryCandidateOrders(ctx)
	if err != nil {
		t.Fatalf("failed to get delivery candidate orders: %v", err)
	}

	// Should have ORD-0001 (Lombok Barat) and ORD-0004 (Mataram)
	if len(candidates) != 2 {
		t.Fatalf("expected 2 candidate orders, got %d", len(candidates))
	}
	if candidates[0].ID != "ORD-0001" || candidates[1].ID != "ORD-0004" {
		t.Errorf("unexpected candidate order order: got %v, %v", candidates[0].ID, candidates[1].ID)
	}
	if len(candidates[0].Items) != 2 {
		t.Errorf("expected 2 items attached to ORD-0001, got %d", len(candidates[0].Items))
	}
}

func TestDeliveryDriversCRUD(t *testing.T) {
	ctx := context.Background()
	store := newTestStorage(t)

	// List empty
	drivers, err := store.GetDeliveryDrivers(ctx)
	if err != nil {
		t.Fatalf("failed to list delivery drivers: %v", err)
	}
	if len(drivers) != 0 {
		t.Fatalf("expected 0 drivers initially, got %d", len(drivers))
	}

	// Create driver 1
	d1 := model.DeliveryDriver{
		Name:    "Budi Santoso",
		Phone:   "08123456789",
		Vehicle: "Grand Max (DR 1234 XY)",
		Active:  true,
	}
	id1, err := store.CreateDeliveryDriver(ctx, d1)
	if err != nil {
		t.Fatalf("failed to create driver 1: %v", err)
	}
	if id1 <= 0 {
		t.Fatalf("expected positive id, got %d", id1)
	}

	// Duplicate name constraint check
	_, err = store.CreateDeliveryDriver(ctx, model.DeliveryDriver{Name: "budi santoso"})
	if err == nil {
		t.Fatal("expected duplicate name error, got nil")
	}

	// Create driver 2
	d2 := model.DeliveryDriver{
		Name:    "Agus Prayogo",
		Phone:   "08765432100",
		Vehicle: "Motor Box (DR 5678 AB)",
		Active:  true,
	}
	id2, err := store.CreateDeliveryDriver(ctx, d2)
	if err != nil {
		t.Fatalf("failed to create driver 2: %v", err)
	}

	// List drivers
	drivers, err = store.GetDeliveryDrivers(ctx)
	if err != nil {
		t.Fatalf("failed to list delivery drivers: %v", err)
	}
	if len(drivers) != 2 {
		t.Fatalf("expected 2 drivers, got %d", len(drivers))
	}
	// Sorted by name: Agus Prayogo, Budi Santoso
	if drivers[0].ID != id2 || drivers[1].ID != id1 {
		t.Errorf("expected Agus then Budi, got %s then %s", drivers[0].Name, drivers[1].Name)
	}

	// Update driver 1
	d1.Phone = "08199999999"
	d1.Active = false
	if err := store.UpdateDeliveryDriver(ctx, id1, d1); err != nil {
		t.Fatalf("failed to update driver: %v", err)
	}

	drivers, _ = store.GetDeliveryDrivers(ctx)
	// Active first: Agus (active) then Budi (inactive)
	if drivers[0].ID != id2 || drivers[1].ID != id1 {
		t.Errorf("expected active driver first")
	}
	if drivers[1].Phone != "08199999999" || drivers[1].Active {
		t.Errorf("driver update did not persist correctly")
	}

	// Delete driver 2
	if err := store.DeleteDeliveryDriver(ctx, id2); err != nil {
		t.Fatalf("failed to delete driver: %v", err)
	}
	// Delete again should return ErrNotFound
	if err := store.DeleteDeliveryDriver(ctx, id2); err == nil {
		t.Fatal("expected ErrNotFound when deleting non-existent driver")
	}
}

func TestDeliveryRunsAndPicking(t *testing.T) {
	ctx := context.Background()
	store := newTestStorage(t)

	run := model.DeliveryRun{
		Title:        "Morning Dispatch Mataram",
		DriverName:   "Budi Santoso",
		Areas:        []string{"Mataram"},
		DeliveryDate: "2026-02-10",
		Notes:        "Deliver before 12:00 PM",
		Items: []model.DeliveryRunItem{
			{
				OrderID:       "ORD-0001",
				OrderNumber:   "ORD-0001",
				RowIndex:      2,
				Customer:      "RS Harapan",
				Area:          "Mataram",
				NamaBarang:    "Spuit 5cc",
				Satuan:        "BOX",
				Jumlah:        "10",
				BelumTerkirim: "10",
				PlannedQty:    "5",
				StatusOrder:   "BELUM SELESAI",
				StatusBarang:  "STOK GUDANG",
				Note:          "Box nomor 1",
			},
			{
				OrderID:       "ORD-0002",
				OrderNumber:   "ORD-0002",
				RowIndex:      3,
				Customer:      "Klinik Sehat",
				Area:          "Mataram",
				NamaBarang:    "Infus Set",
				Satuan:        "PCS",
				Jumlah:        "20",
				BelumTerkirim: "20",
				PlannedQty:    "20",
				StatusOrder:   "PROSES",
				StatusBarang:  "STOK GUDANG",
			},
		},
	}

	runID, err := store.CreateDeliveryRun(ctx, run)
	if err != nil {
		t.Fatalf("failed to create delivery run: %v", err)
	}

	// Fetch run by ID
	fetched, err := store.GetDeliveryRunByID(ctx, runID)
	if err != nil {
		t.Fatalf("failed to get run by ID: %v", err)
	}
	if fetched.Status != "PLANNED" {
		t.Errorf("expected default status PLANNED, got %s", fetched.Status)
	}
	if fetched.TotalItems != 2 || fetched.PickedItems != 0 {
		t.Errorf("expected 2 total, 0 picked; got %d total, %d picked", fetched.TotalItems, fetched.PickedItems)
	}
	if len(fetched.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(fetched.Items))
	}
	if fetched.Items[0].SourceKey == "" {
		t.Errorf("expected auto-populated source key")
	}

	// Pick first item -> status should auto-transition to PICKING
	item1ID := fetched.Items[0].ID
	item2ID := fetched.Items[1].ID

	updatedRun, err := store.ToggleDeliveryRunItemPicked(ctx, runID, item1ID, true)
	if err != nil {
		t.Fatalf("failed to pick item 1: %v", err)
	}
	if updatedRun.Status != "PICKING" {
		t.Errorf("expected auto-transition to PICKING, got %s", updatedRun.Status)
	}
	if updatedRun.PickedItems != 1 {
		t.Errorf("expected 1 picked item, got %d", updatedRun.PickedItems)
	}

	// Pick second item -> status should auto-transition to READY
	updatedRun, err = store.ToggleDeliveryRunItemPicked(ctx, runID, item2ID, true)
	if err != nil {
		t.Fatalf("failed to pick item 2: %v", err)
	}
	if updatedRun.Status != "READY" {
		t.Errorf("expected auto-transition to READY, got %s", updatedRun.Status)
	}
	if updatedRun.PickedItems != 2 {
		t.Errorf("expected 2 picked items, got %d", updatedRun.PickedItems)
	}

	// Unpick item 2 -> transitions back to PICKING
	updatedRun, err = store.ToggleDeliveryRunItemPicked(ctx, runID, item2ID, false)
	if err != nil {
		t.Fatalf("failed to unpick item 2: %v", err)
	}
	if updatedRun.Status != "PICKING" {
		t.Errorf("expected status PICKING after unpick, got %s", updatedRun.Status)
	}

	// Test UpdateDeliveryRun preserves existing picked items
	runToUpdate := *updatedRun
	runToUpdate.Title = "Updated Dispatch Title"
	// Caller sends updated run with Picked = false for item 1, but existing source key should preserve picked state
	runToUpdate.Items[0].Picked = false
	if err := store.UpdateDeliveryRun(ctx, runID, runToUpdate); err != nil {
		t.Fatalf("failed to update delivery run: %v", err)
	}
	refetched, err := store.GetDeliveryRunByID(ctx, runID)
	if err != nil {
		t.Fatalf("failed to get refetched run: %v", err)
	}
	if refetched.Title != "Updated Dispatch Title" {
		t.Errorf("expected updated title")
	}
	if !refetched.Items[0].Picked {
		t.Errorf("expected item 1 to preserve picked state")
	}

	// Test list filtering
	runs, err := store.GetDeliveryRuns(ctx, storage.DeliveryRunFilter{
		DeliveryDate: "2026-02-10",
		Area:         "Mataram",
	})
	if err != nil {
		t.Fatalf("failed to filter runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected 1 matching run, got %d", len(runs))
	}

	// Test SyncMirror does NOT delete runs or drivers
	if err := store.SyncMirror(ctx, []model.NormalizedItem{}, []model.Order{}); err != nil {
		t.Fatalf("failed to sync mirror: %v", err)
	}
	runsAfterSync, err := store.GetDeliveryRuns(ctx, storage.DeliveryRunFilter{})
	if err != nil || len(runsAfterSync) != 1 {
		t.Fatalf("expected delivery runs preserved after SyncMirror")
	}

	// Delete delivery run
	if err := store.DeleteDeliveryRun(ctx, runID); err != nil {
		t.Fatalf("failed to delete delivery run: %v", err)
	}
	if _, err := store.GetDeliveryRunByID(ctx, runID); err == nil {
		t.Fatalf("expected ErrNotFound after deletion")
	}
}
