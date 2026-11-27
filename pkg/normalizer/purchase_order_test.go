package normalizer

import (
	"reflect"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

func TestNormalizePurchaseOrderRows(t *testing.T) {
	aliases := map[string]string{
		"batunyala": "PKM Batunyala",
		"bayan":     "PKM Bayan",
		"ubung":     "PKM Ubung",
	}

	d1 := time.Date(2026, 2, 10, 0, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 2, 12, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		rawRows  []model.RawPurchaseOrderRow
		aliases  map[string]string
		expected []model.PurchaseOrderItem
	}{
		{
			name: "forward-fills Tanggal and Pemasok independently, does not forward-fill NIE or KodeBarang",
			rawRows: []model.RawPurchaseOrderRow{
				{
					Tanggal:     "10/02/2026",
					Pemasok:     "PT Medika Utama",
					KodeBarang:  "KB-001",
					NIE:         "AKD 12345",
					NamaBarang:  "Masker Bedah",
					Jumlah:      "10",
					Satuan:      "Box",
					StatusOrder: "-",
					Keterangan:  "STOK",
					Catatan:     "  Urgent  ",
				},
				{
					Tanggal:     "",
					Pemasok:     "",
					KodeBarang:  "",
					NIE:         "",
					NamaBarang:  "Sarung Tangan",
					Jumlah:      "5",
					Satuan:      "Box",
					StatusOrder: "",
					Keterangan:  "BATUNYALA, BAYAN, SENARU",
					Catatan:     "",
				},
				{
					Tanggal:     "",
					Pemasok:     "PT Farma Jaya",
					KodeBarang:  "KB-003",
					NIE:         "AKL 99999",
					NamaBarang:  "Alkohol 70%",
					Jumlah:      "20",
					Satuan:      "Botol",
					StatusOrder: "  TERKIRIM  ",
					Keterangan:  "UBUNG,STOK",
					Catatan:     "Batch A",
				},
				{
					Tanggal:     "12/02/2026",
					Pemasok:     "",
					NamaBarang:  "Kapas Steril",
					Jumlah:      "3",
					Satuan:      "Pack",
					StatusOrder: "PROSES",
					Keterangan:  "batunyala, PKM Batunyala, stock",
				},
			},
			aliases: aliases,
			expected: []model.PurchaseOrderItem{
				{
					RowIndex:    2,
					Tanggal:     d1,
					Pemasok:     "PT Medika Utama",
					KodeBarang:  "KB-001",
					NIE:         "AKD 12345",
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
					KodeBarang:  "",
					NIE:         "",
					NamaBarang:  "Sarung Tangan",
					Jumlah:      "5",
					Satuan:      "Box",
					StatusOrder: "",
					Keterangan:  "PKM Batunyala, PKM Bayan, SENARU",
					Clients:     []string{"PKM Batunyala", "PKM Bayan", "SENARU"},
					IsStock:     false,
					Catatan:     "",
				},
				{
					RowIndex:    4,
					Tanggal:     d1,
					Pemasok:     "PT Farma Jaya",
					KodeBarang:  "KB-003",
					NIE:         "AKL 99999",
					NamaBarang:  "Alkohol 70%",
					Jumlah:      "20",
					Satuan:      "Botol",
					StatusOrder: "TERKIRIM",
					Keterangan:  "PKM Ubung, STOK",
					Clients:     []string{"PKM Ubung", "STOK"},
					IsStock:     true,
					Catatan:     "Batch A",
				},
				{
					RowIndex:    5,
					Tanggal:     d2,
					Pemasok:     "PT Farma Jaya",
					KodeBarang:  "",
					NIE:         "",
					NamaBarang:  "Kapas Steril",
					Jumlah:      "3",
					Satuan:      "Pack",
					StatusOrder: "PROSES",
					Keterangan:  "PKM Batunyala, stock",
					Clients:     []string{"PKM Batunyala", "stock"},
					IsStock:     true,
					Catatan:     "",
				},
			},
		},
		{
			name: "skips rows with blank NamaBarang",
			rawRows: []model.RawPurchaseOrderRow{
				{
					Tanggal:    "10/02/2026",
					Pemasok:    "PT Medika",
					NamaBarang: "   ",
				},
				{
					Tanggal:    "",
					Pemasok:    "",
					NamaBarang: "Spuit 3cc",
					Jumlah:     "100",
					Satuan:     "Pcs",
				},
			},
			aliases: nil,
			expected: []model.PurchaseOrderItem{
				{
					RowIndex:    3,
					Tanggal:     d1,
					Pemasok:     "PT Medika",
					KodeBarang:  "",
					NIE:         "",
					NamaBarang:  "Spuit 3cc",
					Jumlah:      "100",
					Satuan:      "Pcs",
					StatusOrder: "",
					Keterangan:  "",
					Clients:     []string{},
					IsStock:     false,
					Catatan:     "",
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := NormalizePurchaseOrderRows(tc.rawRows, tc.aliases)
			if !reflect.DeepEqual(got, tc.expected) {
				t.Fatalf("mismatch:\ngot:  %+v\nwant: %+v", got, tc.expected)
			}
		})
	}
}
