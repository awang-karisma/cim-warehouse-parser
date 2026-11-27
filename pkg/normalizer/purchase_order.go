package normalizer

import (
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

// NormalizePurchaseOrderRows normalizes raw rows from the "PERMINTAAN PEMBELIAN" sheet.
// Tanggal and Pemasok are forward-filled independently down until the next non-empty value.
// KodeBarang and NIE are per-item and never forward-filled.
// Rows with an empty NamaBarang are skipped.
func NormalizePurchaseOrderRows(rawRows []model.RawPurchaseOrderRow, aliases map[string]string) []model.PurchaseOrderItem {
	// Build case-insensitive alias lookup map.
	aliasLookup := make(map[string]string, len(aliases))
	for k, v := range aliases {
		lk := strings.ToLower(strings.TrimSpace(k))
		tv := strings.TrimSpace(v)
		if lk != "" && tv != "" {
			aliasLookup[lk] = tv
		}
	}

	items := make([]model.PurchaseOrderItem, 0, len(rawRows))
	var lastTanggal time.Time
	var lastPemasok string

	for i, raw := range rawRows {
		if tStr := strings.TrimSpace(raw.Tanggal); tStr != "" {
			if parsed := model.ParseDate(tStr); !parsed.IsZero() {
				lastTanggal = parsed
			}
		}
		if pStr := strings.TrimSpace(raw.Pemasok); pStr != "" {
			lastPemasok = pStr
		}

		namaBarang := strings.TrimSpace(raw.NamaBarang)
		if namaBarang == "" {
			continue
		}

		rowIndex := raw.RowIndex
		if rowIndex <= 0 {
			rowIndex = i + 2
		}

		statusOrder := strings.TrimSpace(raw.StatusOrder)
		if statusOrder == "-" {
			statusOrder = ""
		}

		clients, isStock, keterangan := normalizePOKeterangan(raw.Keterangan, aliasLookup)

		items = append(items, model.PurchaseOrderItem{
			RowIndex:    rowIndex,
			Tanggal:     lastTanggal,
			Pemasok:     lastPemasok,
			KodeBarang:  strings.TrimSpace(raw.KodeBarang),
			NIE:         strings.TrimSpace(raw.NIE),
			NamaBarang:  namaBarang,
			Jumlah:      strings.TrimSpace(raw.Jumlah),
			Satuan:      strings.TrimSpace(raw.Satuan),
			StatusOrder: statusOrder,
			Keterangan:  keterangan,
			Clients:     clients,
			IsStock:     isStock,
			Catatan:     strings.TrimSpace(raw.Catatan),
		})
	}

	return items
}

func normalizePOKeterangan(raw string, aliasLookup map[string]string) ([]string, bool, string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{}, false, ""
	}

	parts := strings.Split(trimmed, ",")
	clients := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	isStock := false

	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			continue
		}

		lower := strings.ToLower(token)
		if lower == "stok" || lower == "stock" {
			isStock = true
		}

		resolved := token
		if canonical, ok := aliasLookup[lower]; ok {
			resolved = canonical
			resolvedLower := strings.ToLower(resolved)
			if resolvedLower == "stok" || resolvedLower == "stock" {
				isStock = true
			}
		}

		dedupKey := strings.ToLower(resolved)
		if _, exists := seen[dedupKey]; exists {
			continue
		}
		seen[dedupKey] = struct{}{}
		clients = append(clients, resolved)
	}

	return clients, isStock, strings.Join(clients, ", ")
}
