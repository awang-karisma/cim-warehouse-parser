// Package parser provides parsing capabilities for Google Sheets and CSV order tracking data.
package parser

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/normalizer"
	gsheets "github.com/esome/google-sheets-parser"
	"google.golang.org/api/sheets/v4"
)

func applyCustomerAliases(items []model.NormalizedItem, aliases map[string]model.CustomerAlias) []model.NormalizedItem {
	if len(aliases) == 0 {
		return items
	}
	for i := range items {
		key := strings.ToLower(strings.TrimSpace(items[i].Customer))
		if mapping, ok := aliases[key]; ok {
			if strings.TrimSpace(mapping.Canonical) != "" {
				items[i].Customer = mapping.Canonical
			}
			if strings.TrimSpace(mapping.Area) != "" {
				items[i].Area = mapping.Area
			}
		}
	}
	return items
}

// ParseSheet fetches order tracking data from a Google Sheet using the provided sheets.Service,
// parses it into raw rows using github.com/esome/google-sheets-parser, and returns both
// normalized items and grouped orders.
func ParseSheet(ctx context.Context, svc *sheets.Service, spreadsheetID string, sheetName string) ([]model.NormalizedItem, []model.Order, error) {
	return ParseSheetWithAliases(ctx, svc, spreadsheetID, sheetName, nil)
}

// ParseSheetWithAliases fetches order tracking data from a Google Sheet, applies customer aliases,
// and groups orders using the canonical customer names.
func ParseSheetWithAliases(ctx context.Context, svc *sheets.Service, spreadsheetID string, sheetName string, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
	if svc == nil {
		return nil, nil, fmt.Errorf("sheets service is nil")
	}
	if spreadsheetID == "" {
		return nil, nil, fmt.Errorf("spreadsheet ID cannot be empty")
	}
	if sheetName == "" {
		sheetName = "PESANAN"
	}

	cfg := gsheets.MakeConfig(svc, spreadsheetID,
		gsheets.WithContext(ctx),
		gsheets.WithSheetName(sheetName),
		gsheets.WithAllowSkipColumns(true),
		gsheets.WithAllowSkipFields(true),
	)

	rawRows, err := gsheets.ParseSheetIntoStructSlice[model.RawOrderRow](cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse sheet %q: %w", sheetName, err)
	}

	items := normalizer.NormalizeRows(rawRows)
	items = applyCustomerAliases(items, aliases)
	orders := normalizer.GroupOrders(items)
	return items, orders, nil
}
// ParseCSV reads order data from an io.Reader containing CSV formatted data,
// maps CSV header columns to RawOrderRow fields, normalizes rows, and groups orders.
func ParseCSV(r io.Reader) ([]model.NormalizedItem, []model.Order, error) {
	return ParseCSVWithAliases(r, nil)
}

// ParseCSVWithAliases reads CSV order data, applies customer aliases, and groups orders.
func ParseCSVWithAliases(r io.Reader, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
	csvReader := csv.NewReader(r)
	csvReader.LazyQuotes = true
	csvReader.FieldsPerRecord = -1

	headers, err := csvReader.Read()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	colMap := make(map[string]int, len(headers))
	for i, h := range headers {
		clean := strings.TrimSpace(h)
		clean = strings.TrimPrefix(clean, "\ufeff") // strip UTF-8 BOM if present
		colMap[strings.ToLower(clean)] = i
	}

	getCol := func(record []string, colNames ...string) string {
		for _, name := range colNames {
			if idx, ok := colMap[strings.ToLower(name)]; ok && idx < len(record) {
				return record[idx]
			}
		}
		return ""
	}

	var rawRows []model.RawOrderRow
	recordIdx := 0
	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read CSV record at row %d: %w", recordIdx+2, err)
		}

		rawRow := model.RawOrderRow{
			RowIndex:           recordIdx + 2, // 1-based sheet row index (row 1 is header)
			Tanggal:            getCol(record, "Tanggal"),
			Customer:           getCol(record, "Customer"),
			Area:               getCol(record, "Area"),
			NamaBarang:         getCol(record, "Nama Barang", "NamaBarang"),
			Jumlah:             getCol(record, "Jumlah"),
			Satuan:             getCol(record, "Satuan"),
			TanggalPengiriman:  getCol(record, "Tanggal Pengiriman", "TanggalPengiriman"),
			LeadTimePengiriman: getCol(record, "Lead Time Pengiriman", "LeadTimePengiriman"),
			JumlahTerkirim:     getCol(record, "Jumlah Terkirim", "JumlahTerkirim"),
			BelumTerkirim:      getCol(record, "Belum Terkirim", "BelumTerkirim"),
			StatusOrder:        getCol(record, "Status Order", "StatusOrder"),
			StatusBarang:       getCol(record, "Status Barang", "StatusBarang"),
			Keterangan:         getCol(record, "Keterangan"),
			Catatan:            getCol(record, "Catatan"),
		}
		rawRows = append(rawRows, rawRow)
		recordIdx++
	}

	items := normalizer.NormalizeRows(rawRows)
	items = applyCustomerAliases(items, aliases)
	orders := normalizer.GroupOrders(items)
	return items, orders, nil
}

// ParseCSVFile reads and parses a CSV file at filePath into normalized items and grouped orders.
func ParseCSVFile(filePath string) ([]model.NormalizedItem, []model.Order, error) {
	return ParseCSVFileWithAliases(filePath, nil)
}

// ParseCSVFileWithAliases reads and parses a CSV file at filePath, applies customer aliases, and groups orders.
func ParseCSVFileWithAliases(filePath string, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open CSV file %q: %w", filePath, err)
	}
	defer file.Close()

	return ParseCSVWithAliases(file, aliases)
}
