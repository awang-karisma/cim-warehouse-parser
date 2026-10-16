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
		orderNum string
	}{
		{2, "02/01/2026", "RS Narmada", "Lombok Barat", "Yellowtip", ""},
		{3, "02/01/2026", "RS Patuh Karya", "Lombok Tengah", "BC-5D Control", ""},
		{4, "02/01/2026", "RS Patuh Karya", "Lombok Tengah", "Mindray BS-230 Control", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"},
		{5, "02/01/2026", "RS Patuh Karya", "Lombok Tengah", "Clinchem Multicontrol Level 1", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"},
		{6, "02/01/2026", "RS Patuh Karya", "Lombok Timur", "Mindray Diff Lyse", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"},
		{7, "02/01/2026", "RS Patuh Karya", "Lombok Timur", "Mindray LH Lyse", "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"},
		{8, "03/01/2026", "RS Gerung", "", "Povidone 1L", ""},
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
		if got.OrderNumber != exp.orderNum {
			t.Errorf("[%d] expected OrderNumber %q, got %q", i, exp.orderNum, got.OrderNumber)
		}
		if got.EcatalogNumber != exp.orderNum {
			t.Errorf("[%d] expected EcatalogNumber %q, got %q", i, exp.orderNum, got.EcatalogNumber)
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

func TestNormalizeRows_CaseA_StandaloneCustomer(t *testing.T) {
	rawRows := []model.RawOrderRow{
		{
			Tanggal:    "02/01/2026",
			Customer:   "RS Patuh Karya",
			Area:       "Lombok Tengah",
			NamaBarang: "Spuit 3cc",
		},
		{
			Customer:   "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			NamaBarang: "Needle 23G",
		},
		{
			NamaBarang: "Infus Set",
		},
	}

	items := normalizer.NormalizeRows(rawRows)
	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(items))
	}

	// Item 0: Customer is RS Patuh Karya, no EP code yet
	if items[0].Customer != "RS Patuh Karya" || items[0].Area != "Lombok Tengah" {
		t.Errorf("item 0 customer/area unexpected: %+v", items[0])
	}
	if items[0].OrderNumber != "" || items[0].EcatalogNumber != "" {
		t.Errorf("item 0 order numbers unexpected: %+v", items[0])
	}

	// Item 1: Inherited RS Patuh Karya, set EP code
	if items[1].Customer != "RS Patuh Karya" || items[1].Area != "Lombok Tengah" {
		t.Errorf("item 1 customer/area unexpected: %+v", items[1])
	}
	if items[1].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || items[1].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("item 1 order numbers unexpected: %+v", items[1])
	}

	// Item 2: Forward-filled RS Patuh Karya and EP code
	if items[2].Customer != "RS Patuh Karya" || items[2].Area != "Lombok Tengah" {
		t.Errorf("item 2 customer/area unexpected: %+v", items[2])
	}
	if items[2].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" || items[2].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
		t.Errorf("item 2 order numbers unexpected: %+v", items[2])
	}
}

func TestNormalizeRows_CaseB_CustomerWithEP(t *testing.T) {
	rawRows := []model.RawOrderRow{
		{
			Tanggal:    "02/01/2026",
			Customer:   "LABKES LOTENG (EP-01KRX23FMPP4JB35R8B0723SQQ)",
			NamaBarang: "Yellowtip",
		},
		{
			Tanggal:    "02/01/2026",
			Customer:   "PKM SENGKOL\nEP-01KQV695JP6ZCR2X0WKPMK2E54",
			NamaBarang: "Bluetip",
		},
		{
			Tanggal:    "02/01/2026",
			Customer:   "PKM SENGKOL\n(EP-01KQV695JP6ZCR2X0WKPMK2E54)",
			NamaBarang: "Spuit 5cc",
		},
		{
			Tanggal:    "02/01/2026",
			Customer:   "UPTD BLUD LABKESDA (DIKES LOTENG)\n(EP-01KRX23FMPP4JB35R8B0723SQQ)",
			NamaBarang: "Spuit 10cc",
		},
	}

	items := normalizer.NormalizeRows(rawRows)
	if len(items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(items))
	}

	expected := []struct {
		customer string
		epCode   string
	}{
		{"LABKES LOTENG", "EP-01KRX23FMPP4JB35R8B0723SQQ"},
		{"PKM SENGKOL", "EP-01KQV695JP6ZCR2X0WKPMK2E54"},
		{"PKM SENGKOL", "EP-01KQV695JP6ZCR2X0WKPMK2E54"},
		{"UPTD BLUD LABKESDA (DIKES LOTENG)", "EP-01KRX23FMPP4JB35R8B0723SQQ"},
	}

	for i, exp := range expected {
		if items[i].Customer != exp.customer {
			t.Errorf("[%d] expected customer %q, got %q", i, exp.customer, items[i].Customer)
		}
		if items[i].OrderNumber != exp.epCode {
			t.Errorf("[%d] expected OrderNumber %q, got %q", i, exp.epCode, items[i].OrderNumber)
		}
		if items[i].EcatalogNumber != exp.epCode {
			t.Errorf("[%d] expected EcatalogNumber %q, got %q", i, exp.epCode, items[i].EcatalogNumber)
		}
	}
}

func TestNormalizeRows_CaseC_EPInKeteranganOrCatatan(t *testing.T) {
	rawRows := []model.RawOrderRow{
		{
			Tanggal:    "02/01/2026",
			Customer:   "RS Patuh Karya",
			NamaBarang: "Item 1",
			Keterangan: "jadi SP e-cat (EP-01KWB2FZ878RP17NMK5KEX1NQ1)",
		},
		{
			Tanggal:    "02/01/2026",
			Customer:   "RS Gerung",
			NamaBarang: "Item 2",
			Catatan:    "E-Purchasing EP-01KRX23FMPP4JB35R8B0723SQQ selesai",
		},
	}

	items := normalizer.NormalizeRows(rawRows)
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	if items[0].Customer != "RS Patuh Karya" {
		t.Errorf("item 0 customer unexpected: %q", items[0].Customer)
	}
	if items[0].OrderNumber != "EP-01KWB2FZ878RP17NMK5KEX1NQ1" || items[0].EcatalogNumber != "EP-01KWB2FZ878RP17NMK5KEX1NQ1" {
		t.Errorf("item 0 order numbers unexpected: %+v", items[0])
	}

	if items[1].Customer != "RS Gerung" {
		t.Errorf("item 1 customer unexpected: %q", items[1].Customer)
	}
	if items[1].OrderNumber != "EP-01KRX23FMPP4JB35R8B0723SQQ" || items[1].EcatalogNumber != "EP-01KRX23FMPP4JB35R8B0723SQQ" {
		t.Errorf("item 1 order numbers unexpected: %+v", items[1])
	}
}

func TestGroupOrders_OrderNumberPropagation(t *testing.T) {
	items := []model.NormalizedItem{
		{
			RowIndex:       2,
			Tanggal:        "02/01/2026",
			Customer:       "RS Patuh Karya",
			NamaBarang:     "Spuit 3cc",
			OrderNumber:    "",
			EcatalogNumber: "",
		},
		{
			RowIndex:       3,
			Tanggal:        "02/01/2026",
			Customer:       "RS Patuh Karya",
			NamaBarang:     "Needle 23G",
			OrderNumber:    "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			EcatalogNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
		},
	}

	orders := normalizer.GroupOrders(items)
	if len(orders) != 1 {
		t.Fatalf("expected 1 order, got %d", len(orders))
	}

	ord := orders[0]
	expectedEP := "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2"
	if ord.OrderNumber != expectedEP || ord.EcatalogNumber != expectedEP {
		t.Errorf("expected order EP %q, got order_number=%q, ecatalog_number=%q", expectedEP, ord.OrderNumber, ord.EcatalogNumber)
	}
	if len(ord.Items) != 2 {
		t.Fatalf("expected 2 items in order, got %d", len(ord.Items))
	}
	for i, item := range ord.Items {
		if item.OrderNumber != expectedEP || item.EcatalogNumber != expectedEP {
			t.Errorf("item %d expected EP %q, got order_number=%q, ecatalog_number=%q", i, expectedEP, item.OrderNumber, item.EcatalogNumber)
		}
	}
}
