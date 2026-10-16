package normalizer_test

import (
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/normalizer"
)

func TestNormalizeRows_ForwardFilling(t *testing.T) {
	rawRows := []model.RawOrderRow{
		{
			Tanggal:    "02/01/2026",
			Customer:   "RS Narmada",
			Area:       "Lombok Barat",
			NamaBarang: "Yellowtip",
			Jumlah:     "6",
			Satuan:     "SAK",
		},
		{
			// Empty Tanggal: should inherit "02/01/2026"
			Customer:   "RS Patuh Karya",
			Area:       "Lombok Tengah",
			NamaBarang: "BC-5D Control",
			Jumlah:     "1",
			Satuan:     "SET",
		},
		{
			// New customer with no area: area should be reset to ""
			Customer:   "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Area:       "",
			NamaBarang: "Mindray BS-230 Control",
			Jumlah:     "1",
			Satuan:     "VIAL",
		},
		{
			// Empty customer and empty area: should inherit EP customer and empty area
			NamaBarang: "Clinchem Multicontrol Level 1",
			Jumlah:     "1",
			Satuan:     "VIAL",
		},
		{
			// Same customer, but area provided: should update area for subsequent rows
			Area:       "Lombok Timur",
			NamaBarang: "Mindray Diff Lyse",
			Jumlah:     "1",
			Satuan:     "BOTOL",
		},
		{
			// Same customer: should retain updated area "Lombok Timur"
			NamaBarang: "Mindray LH Lyse",
			Jumlah:     "1",
			Satuan:     "BOTOL",
		},
		{
			// New date starts: updates Tanggal, new customer
			Tanggal:    "03/01/2026",
			Customer:   "RS Gerung",
			NamaBarang: "Povidone 1L",
			Jumlah:     "7",
			Satuan:     "BOTOL",
		},
	}

	items := normalizer.NormalizeRows(rawRows)

	if len(items) != 7 {
		t.Fatalf("expected 7 normalized items, got %d", len(items))
	}

	expected := []struct {
		rowIndex int
		tanggal  string
		customer string
		area     string
		barang   string
	}{
		{2, "02/01/2026", "RS Narmada", "Lombok Barat", "Yellowtip"},
		{3, "02/01/2026", "RS Patuh Karya", "Lombok Tengah", "BC-5D Control"},
		{4, "02/01/2026", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", "", "Mindray BS-230 Control"},
		{5, "02/01/2026", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", "", "Clinchem Multicontrol Level 1"},
		{6, "02/01/2026", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", "Lombok Timur", "Mindray Diff Lyse"},
		{7, "02/01/2026", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", "Lombok Timur", "Mindray LH Lyse"},
		{8, "03/01/2026", "RS Gerung", "", "Povidone 1L"},
	}

	for i, exp := range expected {
		got := items[i]
		if got.RowIndex != exp.rowIndex {
			t.Errorf("[%d] expected RowIndex %d, got %d", i, exp.rowIndex, got.RowIndex)
		}
		if got.Tanggal != exp.tanggal {
			t.Errorf("[%d] expected Tanggal %q, got %q", i, exp.tanggal, got.Tanggal)
		}
		if got.Customer != exp.customer {
			t.Errorf("[%d] expected Customer %q, got %q", i, exp.customer, got.Customer)
		}
		if got.Area != exp.area {
			t.Errorf("[%d] expected Area %q, got %q", i, exp.area, got.Area)
		}
		if got.NamaBarang != exp.barang {
			t.Errorf("[%d] expected NamaBarang %q, got %q", i, exp.barang, got.NamaBarang)
		}
	}
}

func TestNormalizeRows_SkipEmptyNamaBarang(t *testing.T) {
	rawRows := []model.RawOrderRow{
		{
			Tanggal:    "02/01/2026",
			Customer:   "RS Narmada",
			Area:       "Lombok Barat",
			NamaBarang: "Yellowtip",
		},
		{
			// Spacer / blank row with empty NamaBarang
			NamaBarang: "   ",
		},
		{
			// Blank row with date transition but empty NamaBarang
			Tanggal:    "03/01/2026",
			Customer:   "RS Patuh Karya",
			NamaBarang: "",
		},
		{
			// Item following the spacer row; should inherit the updated Tanggal and Customer
			NamaBarang: "BC-5D Control",
		},
	}

	items := normalizer.NormalizeRows(rawRows)

	if len(items) != 2 {
		t.Fatalf("expected 2 items after skipping empty NamaBarang rows, got %d", len(items))
	}

	// First item is row 2
	if items[0].RowIndex != 2 || items[0].NamaBarang != "Yellowtip" {
		t.Errorf("item 0 unexpected: %+v", items[0])
	}

	// Second item is row 5 (original index 3 -> i+2 = 5)
	if items[1].RowIndex != 5 || items[1].NamaBarang != "BC-5D Control" {
		t.Errorf("item 1 unexpected: %+v", items[1])
	}
	if items[1].Tanggal != "03/01/2026" {
		t.Errorf("expected inherited Tanggal 03/01/2026, got %q", items[1].Tanggal)
	}
	if items[1].Customer != "RS Patuh Karya" {
		t.Errorf("expected inherited Customer RS Patuh Karya, got %q", items[1].Customer)
	}
}

func TestGroupOrders(t *testing.T) {
	items := []model.NormalizedItem{
		{
			RowIndex:   2,
			Tanggal:    "02/01/2026",
			Customer:   "RS Narmada",
			Area:       "Lombok Barat",
			NamaBarang: "Yellowtip",
			Jumlah:     "6",
			Satuan:     "SAK",
		},
		{
			RowIndex:   3,
			Tanggal:    "02/01/2026",
			Customer:   "RS Patuh Karya",
			Area:       "Lombok Tengah",
			NamaBarang: "BC-5D Control",
			Jumlah:     "1",
			Satuan:     "SET",
		},
		{
			RowIndex:   4,
			Tanggal:    "02/01/2026",
			Customer:   "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Area:       "",
			NamaBarang: "Mindray BS-230 Control",
			Jumlah:     "1",
			Satuan:     "VIAL",
		},
		{
			RowIndex:   5,
			Tanggal:    "02/01/2026",
			Customer:   "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Area:       "",
			NamaBarang: "Clinchem Multicontrol Level 1",
			Jumlah:     "1",
			Satuan:     "VIAL",
		},
		{
			RowIndex:   6,
			Tanggal:    "03/01/2026",
			Customer:   "RS Gerung",
			Area:       "",
			NamaBarang: "Povidone 1L",
			Jumlah:     "7",
			Satuan:     "BOTOL",
		},
		{
			// Same customer RS Gerung, but new date -> separate order
			RowIndex:   7,
			Tanggal:    "04/01/2026",
			Customer:   "RS Gerung",
			Area:       "",
			NamaBarang: "Spinocan 25G",
			Jumlah:     "2",
			Satuan:     "BOX",
		},
	}

	orders := normalizer.GroupOrders(items)

	if len(orders) != 5 {
		t.Fatalf("expected 5 grouped orders, got %d", len(orders))
	}

	expectedOrders := []struct {
		id        string
		tanggal   string
		customer  string
		itemCount int
	}{
		{"ORD-0001", "02/01/2026", "RS Narmada", 1},
		{"ORD-0002", "02/01/2026", "RS Patuh Karya", 1},
		{"ORD-0003", "02/01/2026", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", 2},
		{"ORD-0004", "03/01/2026", "RS Gerung", 1},
		{"ORD-0005", "04/01/2026", "RS Gerung", 1},
	}

	for i, exp := range expectedOrders {
		got := orders[i]
		if got.ID != exp.id {
			t.Errorf("[%d] expected ID %q, got %q", i, exp.id, got.ID)
		}
		if got.Tanggal != exp.tanggal {
			t.Errorf("[%d] expected Tanggal %q, got %q", i, exp.tanggal, got.Tanggal)
		}
		if got.Customer != exp.customer {
			t.Errorf("[%d] expected Customer %q, got %q", i, exp.customer, got.Customer)
		}
		if len(got.Items) != exp.itemCount {
			t.Errorf("[%d] expected %d items, got %d", i, exp.itemCount, len(got.Items))
		}
	}
}

func TestGroupOrders_Empty(t *testing.T) {
	orders := normalizer.GroupOrders(nil)
	if len(orders) != 0 {
		t.Errorf("expected 0 orders for nil input, got %d", len(orders))
	}

	orders = normalizer.GroupOrders([]model.NormalizedItem{})
	if len(orders) != 0 {
		t.Errorf("expected 0 orders for empty slice, got %d", len(orders))
	}
}
