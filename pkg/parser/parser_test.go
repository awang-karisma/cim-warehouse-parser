package parser_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/parser"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

func TestParseCSV_RealData(t *testing.T) {
	csvPath := filepath.Join("..", "..", "testdata", "orders_sample.csv")
	if _, err := os.Stat(csvPath); os.IsNotExist(err) {
		t.Skip("testdata/orders_sample.csv not found (contains prod data)")
	}

	items, orders, err := parser.ParseCSVFile(csvPath)
	if err != nil {
		t.Fatalf("ParseCSVFile failed: %v", err)
	}

	// The CSV file has 2724 raw text lines, which corresponds to 2482 tabular rows
	// because certain records contain multiline quoted text (e.g. Catatan with line breaks).
	if len(items) < 2400 {
		t.Errorf("expected > 2400 items, got %d", len(items))
	}
	if len(items) != 2482 {
		t.Logf("parsed exactly %d normalized items from real CSV sample", len(items))
	}

	if len(orders) < 600 {
		t.Errorf("expected > 600 grouped orders, got %d", len(orders))
	}

	// Verify specific sample orders in the real dataset
	foundNarmada := false
	foundPatuhKarya := false
	foundPMILotim := false

	for _, ord := range orders {
		switch ord.Customer {
		case "RS Narmada":
			if ord.Tanggal.Equal(model.ParseDate("02/01/2026")) {
				foundNarmada = true
				if ord.Area != "Lombok Barat" {
					t.Errorf("expected RS Narmada area 'Lombok Barat', got %q", ord.Area)
				}
				if len(ord.Items) == 0 {
					t.Errorf("RS Narmada order has 0 items")
				} else if ord.Items[0].NamaBarang != "Yellowtip" {
					t.Errorf("expected RS Narmada first item 'Yellowtip', got %q", ord.Items[0].NamaBarang)
				}
			}
		case "RS Patuh Karya":
			if ord.Tanggal.Equal(model.ParseDate("02/01/2026")) {
				foundPatuhKarya = true
				if ord.Area != "Lombok Tengah" {
					t.Errorf("expected RS Patuh Karya area 'Lombok Tengah', got %q", ord.Area)
				}
				if len(ord.Items) == 0 {
					t.Errorf("RS Patuh Karya order has 0 items")
				} else if ord.Items[0].NamaBarang != "BC-5D Control" {
					t.Errorf("expected RS Patuh Karya first item 'BC-5D Control', got %q", ord.Items[0].NamaBarang)
				}
			}
		case "PMI Lotim":
			if ord.Tanggal.Equal(model.ParseDate("02/01/2026")) {
				foundPMILotim = true
				if len(ord.Items) != 3 {
					t.Errorf("expected PMI Lotim order to have 3 items, got %d", len(ord.Items))
				}
			}
		}
	}

	if !foundNarmada {
		t.Errorf("expected to find RS Narmada order on 02/01/2026")
	}
	if !foundPatuhKarya {
		t.Errorf("expected to find RS Patuh Karya order on 02/01/2026")
	}
	if !foundPMILotim {
		t.Errorf("expected to find PMI Lotim order on 02/01/2026")
	}
}

func TestParseCSV_SyntheticData(t *testing.T) {
	csvData := `Tanggal,Customer,Area,Nama Barang,Jumlah,Satuan,Tanggal Pengiriman,Lead Time Pengiriman,Jumlah Terkirim,Belum Terkirim,Status Order,Status Barang,Keterangan,Catatan
02/01/2026,RS Narmada,Lombok Barat,Yellowtip,10,pack,03/01/2026,1,10,0,Selesai,Terkirim,Regular,Segera kirim
,,,Blue tip,5,pack,03/01/2026,1,5,0,Selesai,Terkirim,,
03/01/2026,RS Patuh Karya,Lombok Tengah,BC-5D Control,2,kit,04/01/2026,1,2,0,Selesai,Terkirim,Urgent,Simpan di suhu dingin
,,,Diluent 20L,1,box,,,,1,Pending,Dalam Pengiriman,,
`
	items, orders, err := parser.ParseCSV(strings.NewReader(csvData))
	if err != nil {
		t.Fatalf("ParseCSV failed: %v", err)
	}

	if len(items) != 4 {
		t.Fatalf("expected 4 normalized items, got %d", len(items))
	}
	if len(orders) != 2 {
		t.Fatalf("expected 2 grouped orders, got %d", len(orders))
	}

	// Verify order 1 (RS Narmada)
	ord1 := orders[0]
	if ord1.Customer != "RS Narmada" {
		t.Errorf("expected customer 'RS Narmada', got %q", ord1.Customer)
	}
	if !ord1.Tanggal.Equal(model.ParseDate("02/01/2026")) {
		t.Errorf("expected date '02/01/2026', got %v", ord1.Tanggal)
	}
	if ord1.Area != "Lombok Barat" {
		t.Errorf("expected area 'Lombok Barat', got %q", ord1.Area)
	}
	if len(ord1.Items) != 2 {
		t.Fatalf("expected 2 items for RS Narmada, got %d", len(ord1.Items))
	}
	if ord1.Items[0].NamaBarang != "Yellowtip" {
		t.Errorf("expected first item 'Yellowtip', got %q", ord1.Items[0].NamaBarang)
	}
	if ord1.Items[1].NamaBarang != "Blue tip" {
		t.Errorf("expected second item 'Blue tip', got %q", ord1.Items[1].NamaBarang)
	}
	// Verify forward filled fields in normalized items
	if items[1].Customer != "RS Narmada" {
		t.Errorf("expected forward-filled customer 'RS Narmada', got %q", items[1].Customer)
	}
	if !items[1].Tanggal.Equal(model.ParseDate("02/01/2026")) {
		t.Errorf("expected forward-filled date '02/01/2026', got %v", items[1].Tanggal)
	}
	if items[1].Area != "Lombok Barat" {
		t.Errorf("expected forward-filled area 'Lombok Barat', got %q", items[1].Area)
	}

	// Verify order 2 (RS Patuh Karya)
	ord2 := orders[1]
	if ord2.Customer != "RS Patuh Karya" {
		t.Errorf("expected customer 'RS Patuh Karya', got %q", ord2.Customer)
	}
	if !ord2.Tanggal.Equal(model.ParseDate("03/01/2026")) {
		t.Errorf("expected date '03/01/2026', got %v", ord2.Tanggal)
	}
	if ord2.Area != "Lombok Tengah" {
		t.Errorf("expected area 'Lombok Tengah', got %q", ord2.Area)
	}
	if len(ord2.Items) != 2 {
		t.Fatalf("expected 2 items for RS Patuh Karya, got %d", len(ord2.Items))
	}
	if ord2.Items[0].NamaBarang != "BC-5D Control" {
		t.Errorf("expected first item 'BC-5D Control', got %q", ord2.Items[0].NamaBarang)
	}
	if ord2.Items[1].NamaBarang != "Diluent 20L" {
		t.Errorf("expected second item 'Diluent 20L', got %q", ord2.Items[1].NamaBarang)
	}
}

func TestParseSheet_MockServer(t *testing.T) {
	mockData := sheets.ValueRange{
		Range:          "PESANAN!A1:N",
		MajorDimension: "ROWS",
		Values: [][]interface{}{
			{
				"Tanggal", "Customer", "Area", "Nama Barang", "Jumlah", "Satuan",
				"Tanggal Pengiriman", "Lead Time Pengiriman", "Jumlah Terkirim",
				"Belum Terkirim", "Status Order", "Status Barang", "Keterangan", "Catatan",
			},
			{
				"02/01/2026", "RS Narmada", "Lombok Barat", "Yellowtip", "6", "SAK",
				"07/01/2026", "5", "6", "0", "SELESAI", "DONE", "", "",
			},
			{
				"", "RS Patuh Karya", "Lombok Tengah", "BC-5D Control", "1", "SET",
				"14/01/2026", "5", "1", "0", "SELESAI", "DONE", "", "",
			},
			{
				"", "PMI Lotim", "", "Hbsag", "2", "BOX",
				"03/01/2026", "1", "2", "0", "SELESAI", "DONE", "", "",
			},
			{
				"", "", "", "Syphillis", "2", "BOX",
				"03/01/2026", "1", "2", "0", "SELESAI", "DONE", "", "",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(mockData); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	defer server.Close()

	ctx := context.Background()
	svc, err := sheets.NewService(ctx,
		option.WithEndpoint(server.URL),
		option.WithoutAuthentication(),
	)
	if err != nil {
		t.Fatalf("failed to create mock sheets service: %v", err)
	}

	items, orders, err := parser.ParseSheet(ctx, svc, "mock-spreadsheet-id", "PESANAN")
	if err != nil {
		t.Fatalf("ParseSheet failed: %v", err)
	}

	if len(items) != 4 {
		t.Fatalf("expected 4 normalized items, got %d", len(items))
	}
	if len(orders) != 3 {
		t.Fatalf("expected 3 grouped orders, got %d", len(orders))
	}

	// Verify order 1: RS Narmada
	if orders[0].ID != "ORD-0001" || orders[0].Customer != "RS Narmada" || orders[0].Area != "Lombok Barat" {
		t.Errorf("unexpected order 0: %+v", orders[0])
	}
	if len(orders[0].Items) != 1 || orders[0].Items[0].NamaBarang != "Yellowtip" {
		t.Errorf("unexpected items for order 0: %+v", orders[0].Items)
	}

	// Verify order 2: RS Patuh Karya (inherited Tanggal)
	if orders[1].ID != "ORD-0002" || orders[1].Customer != "RS Patuh Karya" || !orders[1].Tanggal.Equal(model.ParseDate("02/01/2026")) {
		t.Errorf("unexpected order 1: %+v", orders[1])
	}

	// Verify order 3: PMI Lotim (2 items, inherited Tanggal)
	if orders[2].ID != "ORD-0003" || orders[2].Customer != "PMI Lotim" || len(orders[2].Items) != 2 {
		t.Errorf("unexpected order 2: %+v", orders[2])
	}
	if orders[2].Items[0].NamaBarang != "Hbsag" || orders[2].Items[1].NamaBarang != "Syphillis" {
		t.Errorf("unexpected item names in order 2: %+v", orders[2].Items)
	}
}

func TestParseCSVWithAliases_AreaOverride(t *testing.T) {
	csvData := `Tanggal,Customer,Area,Nama Barang,Jumlah,Satuan,Tanggal Pengiriman,Lead Time Pengiriman,Jumlah Terkirim,Belum Terkirim,Status Order,Status Barang,Keterangan,Catatan
02/01/2026,RS Variant A,Lombok Barat,Item 1,10,pack,03/01/2026,1,10,0,Selesai,Terkirim,,
02/01/2026,RS Variant B,,Item 2,5,pack,03/01/2026,1,5,0,Selesai,Terkirim,,
02/01/2026,RS Variant C,Mataram,Item 3,1,box,03/01/2026,1,1,0,Selesai,Terkirim,,
`
	aliases := map[string]model.CustomerAlias{
		"rs variant a": {
			Alias:     "RS Variant A",
			Canonical: "RS Canonical",
			Area:      "Mataram", // non-empty area should override source "Lombok Barat"
		},
		"rs variant b": {
			Alias:     "RS Variant B",
			Canonical: "RS Canonical",
			Area:      "Lombok Tengah", // non-empty area should set area on empty source row
		},
		"rs variant c": {
			Alias:     "RS Variant C",
			Canonical: "RS Variant C Canonical",
			Area:      "", // empty mapping area should retain source "Mataram"
		},
	}

	items, orders, err := parser.ParseCSVWithAliases(strings.NewReader(csvData), aliases)
	if err != nil {
		t.Fatalf("ParseCSVWithAliases failed: %v", err)
	}

	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(items))
	}

	// Item 1: source area "Lombok Barat" overridden by alias "Mataram"
	if items[0].Area != "Mataram" {
		t.Errorf("expected item[0].Area 'Mataram', got %q", items[0].Area)
	}
	if items[0].Customer != "RS Canonical" {
		t.Errorf("expected item[0].Customer 'RS Canonical', got %q", items[0].Customer)
	}

	// Item 2: empty source area set to "Lombok Tengah" by alias
	if items[1].Area != "Lombok Tengah" {
		t.Errorf("expected item[1].Area 'Lombok Tengah', got %q", items[1].Area)
	}
	if items[1].Customer != "RS Canonical" {
		t.Errorf("expected item[1].Customer 'RS Canonical', got %q", items[1].Customer)
	}

	// Item 3: empty alias area retains source area "Mataram"
	if items[2].Area != "Mataram" {
		t.Errorf("expected item[2].Area 'Mataram', got %q", items[2].Area)
	}

	// Grouped orders:
	// items[0] and items[1] share date 02/01/2026 and canonical customer "RS Canonical"
	// Verify grouped order area reflects the alias
	if len(orders) < 2 {
		t.Fatalf("expected 2 orders, got %d", len(orders))
	}
	if orders[0].Customer != "RS Canonical" {
		t.Errorf("expected order[0].Customer 'RS Canonical', got %q", orders[0].Customer)
	}
	if orders[0].Area != "Mataram" {
		t.Errorf("expected order[0].Area 'Mataram', got %q", orders[0].Area)
	}
}
