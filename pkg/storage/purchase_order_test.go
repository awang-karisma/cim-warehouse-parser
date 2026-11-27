package storage

import (
	"context"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

func TestSyncAndGetPurchaseOrderItems(t *testing.T) {
	store, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create in-memory storage: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	d1 := time.Date(2026, 2, 10, 0, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 2, 12, 0, 0, 0, 0, time.UTC)

	seed := []model.PurchaseOrderItem{
		{
			RowIndex:    2,
			Tanggal:     d1,
			Pemasok:     "PT Medika Utama",
			KodeBarang:  "KB-001",
			NIE:         "AKD 111",
			NamaBarang:  "Masker Bedah",
			Jumlah:      "10",
			Satuan:      "Box",
			StatusOrder: "",
			Keterangan:  "STOK",
			Clients:     []string{"STOK"},
			IsStock:     true,
			Catatan:     "Urgent",
		},
		{
			RowIndex:    3,
			Tanggal:     d1,
			Pemasok:     "PT Medika Utama",
			KodeBarang:  "KB-002",
			NIE:         "",
			NamaBarang:  "Sarung Tangan",
			Jumlah:      "5",
			Satuan:      "Box",
			StatusOrder: "TERKIRIM",
			Keterangan:  "PKM Batunyala, PKM Bayan",
			Clients:     []string{"PKM Batunyala", "PKM Bayan"},
			IsStock:     false,
			Catatan:     "",
		},
		{
			RowIndex:    4,
			Tanggal:     d2,
			Pemasok:     "PT Farma Jaya",
			KodeBarang:  "KB-003",
			NIE:         "AKL 999",
			NamaBarang:  "Alkohol 70%",
			Jumlah:      "20",
			Satuan:      "Botol",
			StatusOrder: "PROSES",
			Keterangan:  "PKM Ubung, STOK",
			Clients:     []string{"PKM Ubung", "STOK"},
			IsStock:     true,
			Catatan:     "Batch A",
		},
	}

	if err := store.SyncPurchaseOrders(ctx, seed); err != nil {
		t.Fatalf("SyncPurchaseOrders failed: %v", err)
	}

	// 1. Default query (no filters)
	res, err := store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{})
	if err != nil {
		t.Fatalf("GetPurchaseOrderItems failed: %v", err)
	}
	if res.Total != 3 || len(res.Items) != 3 {
		t.Fatalf("expected 3 items, got total=%d len=%d", res.Total, len(res.Items))
	}
	// Default sort: tanggal DESC, row_index ASC -> row 4 first, then row 2, then row 3
	if res.Items[0].RowIndex != 4 || res.Items[1].RowIndex != 2 || res.Items[2].RowIndex != 3 {
		t.Fatalf("unexpected default sort order: %d, %d, %d", res.Items[0].RowIndex, res.Items[1].RowIndex, res.Items[2].RowIndex)
	}
	if res.Stats.Total != 3 || res.Stats.StockItems != 2 || res.Stats.ClientItems != 2 || res.Stats.SuppliersCount != 2 || res.Stats.PendingItems != 3 || res.Stats.FinishedItems != 0 {
		t.Fatalf("unexpected stats: %+v", res.Stats)
	}
	if len(res.Suppliers) != 2 || res.Suppliers[0] != "PT Farma Jaya" || res.Suppliers[1] != "PT Medika Utama" {
		t.Fatalf("unexpected suppliers: %+v", res.Suppliers)
	}
	if len(res.Statuses) != 2 || res.Statuses[0] != "PROSES" || res.Statuses[1] != "TERKIRIM" {
		t.Fatalf("unexpected statuses: %+v", res.Statuses)
	}

	// 2. Filter by Query (case-insensitive across NIE)
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Query: "akl 999"})
	if err != nil || res.Total != 1 || res.Items[0].NamaBarang != "Alkohol 70%" {
		t.Fatalf("query filter failed: err=%v res=%+v", err, res)
	}

	// 3. Filter by Status "__EMPTY__" and "DIPESAN"
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Status: "__EMPTY__"})
	if err != nil || res.Total != 1 || res.Items[0].NamaBarang != "Masker Bedah" {
		t.Fatalf("empty status filter failed: err=%v res=%+v", err, res)
	}
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Status: "DIPESAN"})
	if err != nil || res.Total != 1 || res.Items[0].NamaBarang != "Masker Bedah" {
		t.Fatalf("DIPESAN status filter failed: err=%v res=%+v", err, res)
	}

	// 4. Filter by Type "stock" and "client"
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Type: "stock"})
	if err != nil || res.Total != 2 {
		t.Fatalf("stock type filter failed: err=%v total=%d", err, res.Total)
	}
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Type: "client"})
	if err != nil || res.Total != 2 {
		t.Fatalf("client type filter failed: err=%v total=%d", err, res.Total)
	}

	// 5. Filter by Date range and Supplier
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{
		From:     "2026-02-12",
		To:       "2026-02-12",
		Supplier: "PT Farma Jaya",
	})
	if err != nil || res.Total != 1 || res.Items[0].RowIndex != 4 {
		t.Fatalf("date+supplier filter failed: err=%v res=%+v", err, res)
	}

	// 6. ClearData clears purchase_order_items
	if err := store.ClearData(ctx); err != nil {
		t.Fatalf("ClearData failed: %v", err)
	}
	res, err = store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{})
	if err != nil || res.Total != 0 || res.Items == nil || len(res.Items) != 0 {
		t.Fatalf("expected empty non-nil items after ClearData: err=%v res=%+v", err, res)
	}
}

func TestPurchaseOrderStatsPendingAndFinished(t *testing.T) {
	store, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create in-memory storage: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	d := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)

	seed := []model.PurchaseOrderItem{
		{RowIndex: 1, Tanggal: d, Pemasok: "Sup A", NamaBarang: "Item 1", StatusOrder: ""},
		{RowIndex: 2, Tanggal: d, Pemasok: "Sup A", NamaBarang: "Item 2", StatusOrder: "PROSES"},
		{RowIndex: 3, Tanggal: d, Pemasok: "Sup B", NamaBarang: "Item 3", StatusOrder: "SELESAI"},
		{RowIndex: 4, Tanggal: d, Pemasok: "Sup B", NamaBarang: "Item 4", StatusOrder: " done "},
		{RowIndex: 5, Tanggal: d, Pemasok: "Sup C", NamaBarang: "Item 5", StatusOrder: "Completed"},
		{RowIndex: 6, Tanggal: d, Pemasok: "Sup C", NamaBarang: "Item 6", StatusOrder: "FINISHED"},
	}

	if err := store.SyncPurchaseOrders(ctx, seed); err != nil {
		t.Fatalf("SyncPurchaseOrders failed: %v", err)
	}

	res, err := store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{Status: "PROSES"})
	if err != nil {
		t.Fatalf("GetPurchaseOrderItems failed: %v", err)
	}
	if res.Stats.Total != 6 || res.Stats.PendingItems != 2 || res.Stats.FinishedItems != 4 {
		t.Fatalf("unexpected pending/finished stats: %+v", res.Stats)
	}
}
