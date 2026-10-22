// Package normalizer handles data normalization, forward filling, and order grouping
// for warehouse spreadsheet rows.
package normalizer

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

var (
	epRegex               = regexp.MustCompile(`(?i)\bEP-[A-Z0-9]+\b`)
	custEPWithParensRegex = regexp.MustCompile(`(?i)(?:\s*[(\[]\s*EP-[A-Z0-9]+\s*[)\]]|\s*EP-[A-Z0-9]+)`)
)

// DeliveryEntry represents a parsed shipment date and shipped quantity.
type DeliveryEntry struct {
	Date     string `json:"date"`
	Quantity string `json:"quantity"`
}

// ParseDate parses supported sheet date strings (DD/MM/YYYY and ISO YYYY-MM-DD)
// as calendar dates at UTC midnight without timezone shift. Blank/invalid input becomes zero time.
func ParseDate(raw string) time.Time {
	return model.ParseDate(raw)
}

var deliveryEntryRegex = regexp.MustCompile(`(\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})\s*\(\s*([0-9]+(?:[.,][0-9]+)?)\s*[^)]*\)`)

// ParseDeliveryEntries parses comma-separated, space-separated, or formatted shipment dates and quantities.
// E.g. "07/01/2026 (3), 03/02/2026 (1)" -> [{Date: "2026-01-07", Quantity: "3"}, {Date: "2026-02-03", Quantity: "1"}].
// If no pairs match but raw is non-empty, returns a single entry with normalized date (if parseable) and empty quantity.
// If raw is empty, returns an empty slice.
func ParseDeliveryEntries(raw string) []DeliveryEntry {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []DeliveryEntry{}
	}

	matches := deliveryEntryRegex.FindAllStringSubmatch(trimmed, -1)
	if len(matches) == 0 {
		dateStr := trimmed
		if t := model.ParseDate(trimmed); !t.IsZero() {
			dateStr = t.Format("2006-01-02")
		}
		return []DeliveryEntry{
			{Date: dateStr, Quantity: ""},
		}
	}

	entries := make([]DeliveryEntry, len(matches))
	for i, m := range matches {
		dateRaw := strings.TrimSpace(m[1])
		if t := model.ParseDate(dateRaw); !t.IsZero() {
			dateRaw = t.Format("2006-01-02")
		}
		qtyRaw := strings.TrimSpace(m[2])
		qtyRaw = strings.ReplaceAll(qtyRaw, ",", ".")

		entries[i] = DeliveryEntry{
			Date:     dateRaw,
			Quantity: qtyRaw,
		}
	}
	return entries
}

// canonicalAreas maps lowercase variations and abbreviations of regional areas to canonical names.
var canonicalAreas = map[string]string{
	"lombok timur":            "Lombok Timur",
	"kab. lombok timur":       "Lombok Timur",
	"kab lombok timur":        "Lombok Timur",
	"kabupaten lombok timur":  "Lombok Timur",
	"lotim":                   "Lombok Timur",
	"lombok barat":            "Lombok Barat",
	"kab. lombok barat":       "Lombok Barat",
	"kab lombok barat":        "Lombok Barat",
	"kabupaten lombok barat":  "Lombok Barat",
	"lobar":                   "Lombok Barat",
	"lombok tengah":           "Lombok Tengah",
	"kab. lombok tengah":      "Lombok Tengah",
	"kab lombok tengah":       "Lombok Tengah",
	"kabupaten lombok tengah": "Lombok Tengah",
	"loteng":                  "Lombok Tengah",
	"lombok utara":            "Lombok Utara",
	"kab. lombok utara":       "Lombok Utara",
	"kab lombok utara":        "Lombok Utara",
	"kabupaten lombok utara":  "Lombok Utara",
	"lotara":                  "Lombok Utara",
	"kota mataram":            "Kota Mataram",
	"mataram":                 "Mataram",
	"bima":                    "Bima",
	"kab. bima":               "Bima",
	"kab bima":                "Bima",
	"kabupaten bima":          "Bima",
	"kota bima":               "Kota Bima",
	"sumbawa":                 "Sumbawa",
	"kab. sumbawa":            "Sumbawa",
	"kab sumbawa":             "Sumbawa",
	"kabupaten sumbawa":       "Sumbawa",
	"sumbawa barat":           "Sumbawa Barat",
	"kab. sumbawa barat":      "Sumbawa Barat",
	"kab sumbawa barat":       "Sumbawa Barat",
	"kabupaten sumbawa barat": "Sumbawa Barat",
	"ksb":                     "Sumbawa Barat",
	"sumbawa besar":           "Sumbawa Besar",
	"dompu":                   "Dompu",
	"kab. dompu":              "Dompu",
	"kab dompu":               "Dompu",
	"kabupaten dompu":         "Dompu",
	"ampenan":                 "Ampenan",
}

// NormalizeArea normalizes regional area names by trimming whitespace,
// collapsing multiple spaces/newlines, applying standard title casing,
// and resolving known NTB regional variations to their canonical forms.
// If raw is empty or "-", it returns an empty string.
func NormalizeArea(raw string) string {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}

	cleaned := strings.Join(fields, " ")
	if cleaned == "-" || strings.Trim(cleaned, "- ") == "" {
		return ""
	}

	lowered := strings.ToLower(cleaned)
	if canonical, ok := canonicalAreas[lowered]; ok {
		return canonical
	}

	words := make([]string, len(fields))
	for i, f := range fields {
		words[i] = titleCaseWord(f)
	}
	return strings.Join(words, " ")
}

// NormalizeStatusOrder normalizes a raw status_order string.
// Empty strings, "-", whitespace-only, or dash-only inputs are normalized to "BELUM SELESAI".
func NormalizeStatusOrder(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "-" || strings.Trim(trimmed, "- ") == "" {
		return "BELUM SELESAI"
	}
	return trimmed
}

func titleCaseWord(w string) string {
	parts := strings.Split(w, "-")
	for i, p := range parts {
		upper := strings.ToUpper(p)
		trimmedUpper := strings.Trim(upper, "()[]{}.,")
		if trimmedUpper == "NTB" {
			parts[i] = upper
			continue
		}
		runes := []rune(strings.ToLower(p))
		firstLetter := true
		for j, r := range runes {
			if unicode.IsLetter(r) {
				if firstLetter {
					runes[j] = unicode.ToUpper(r)
					firstLetter = false
				}
			} else {
				firstLetter = true
			}
		}
		parts[i] = string(runes)
	}
	return strings.Join(parts, "-")
}

// extractAndCleanCustomer extracts an EP order code from the customer field (if present)
// and returns the cleaned customer name and the extracted EP code.
func extractAndCleanCustomer(raw string) (cleanCust string, epCode string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ""
	}
	epMatch := epRegex.FindString(trimmed)
	if epMatch != "" {
		epCode = strings.ToUpper(epMatch)
	}

	clean := custEPWithParensRegex.ReplaceAllString(trimmed, "")
	clean = strings.TrimSpace(clean)
	clean = strings.TrimRight(clean, " -")
	if clean == "" {
		return "", epCode
	}

	return clean, epCode
}

// NormalizeRows transforms raw order rows into normalized items by applying
// forward-fill rules for Tanggal, Customer, and Area, filtering out empty rows,
// and preserving accurate 1-based sheet row indices.
func NormalizeRows(rawRows []model.RawOrderRow) []model.NormalizedItem {
	var (
		currentTanggal     time.Time
		currentCustomer    string
		currentArea        string
		currentOrderNumber string
	)

	customerAreaMap := make(map[string]string)
	items := make([]model.NormalizedItem, 0, len(rawRows))

	for i, raw := range rawRows {
		trimmedTanggal := strings.TrimSpace(raw.Tanggal)
		if trimmedTanggal != "" {
			parsedDate := ParseDate(trimmedTanggal)
			if !parsedDate.Equal(currentTanggal) && currentCustomer == "" {
				currentOrderNumber = ""
			}
			currentTanggal = parsedDate
		}

		cleanCust, epFromCust := extractAndCleanCustomer(raw.Customer)
		trimmedArea := NormalizeArea(raw.Area)

		if cleanCust != "" {
			currentCustomer = cleanCust
			custKey := strings.ToLower(strings.TrimSpace(cleanCust))
			if trimmedArea != "" {
				currentArea = trimmedArea
				if _, exists := customerAreaMap[custKey]; !exists {
					customerAreaMap[custKey] = trimmedArea
				}
			} else {
				if known, ok := customerAreaMap[custKey]; ok && known != "" {
					currentArea = known
				} else {
					currentArea = ""
				}
			}
			currentOrderNumber = epFromCust
		} else if epFromCust != "" {
			// Customer field was standalone EP-...! Do NOT overwrite currentCustomer with empty.
			// Inherit currentCustomer and currentArea.
			currentOrderNumber = epFromCust
			if trimmedArea != "" {
				currentArea = trimmedArea
				if currentCustomer != "" {
					custKey := strings.ToLower(strings.TrimSpace(currentCustomer))
					if _, exists := customerAreaMap[custKey]; !exists {
						customerAreaMap[custKey] = trimmedArea
					}
				}
			} else if currentArea == "" && currentCustomer != "" {
				custKey := strings.ToLower(strings.TrimSpace(currentCustomer))
				if known, ok := customerAreaMap[custKey]; ok && known != "" {
					currentArea = known
				}
			}
		} else if trimmedArea != "" {
			currentArea = trimmedArea
			if currentCustomer != "" {
				custKey := strings.ToLower(strings.TrimSpace(currentCustomer))
				if _, exists := customerAreaMap[custKey]; !exists {
					customerAreaMap[custKey] = trimmedArea
				}
			}
		} else if currentArea == "" && currentCustomer != "" {
			custKey := strings.ToLower(strings.TrimSpace(currentCustomer))
			if known, ok := customerAreaMap[custKey]; ok && known != "" {
				currentArea = known
			}
		}
		itemOrderNumber := currentOrderNumber
		if ep := epRegex.FindString(raw.Keterangan); ep != "" {
			itemOrderNumber = strings.ToUpper(ep)
			if currentOrderNumber == "" {
				currentOrderNumber = itemOrderNumber
			}
		} else if ep := epRegex.FindString(raw.Catatan); ep != "" {
			itemOrderNumber = strings.ToUpper(ep)
			if currentOrderNumber == "" {
				currentOrderNumber = itemOrderNumber
			}
		}

		trimmedNamaBarang := strings.TrimSpace(raw.NamaBarang)
		if trimmedNamaBarang == "" {
			continue
		}

		rowIndex := raw.RowIndex
		if rowIndex <= 0 {
			rowIndex = i + 2 // 1-based index: row 1 is header, data starts at row 2
		}

		items = append(items, model.NormalizedItem{
			RowIndex:           rowIndex,
			OrderNumber:        itemOrderNumber,
			EcatalogNumber:     itemOrderNumber,
			Tanggal:            currentTanggal,
			Customer:           currentCustomer,
			Area:               currentArea,
			NamaBarang:         trimmedNamaBarang,
			Jumlah:             strings.TrimSpace(raw.Jumlah),
			Satuan:             strings.TrimSpace(raw.Satuan),
			TanggalPengiriman:  strings.TrimSpace(raw.TanggalPengiriman),
			LeadTimePengiriman: strings.TrimSpace(raw.LeadTimePengiriman),
			JumlahTerkirim:     strings.TrimSpace(raw.JumlahTerkirim),
			BelumTerkirim:      strings.TrimSpace(raw.BelumTerkirim),
			StatusOrder:        NormalizeStatusOrder(raw.StatusOrder),
			StatusBarang:       strings.TrimSpace(raw.StatusBarang),
			Keterangan:         strings.TrimSpace(raw.Keterangan),
			Catatan:            strings.TrimSpace(raw.Catatan),
		})
	}

	// Post-processing passes for cross-order customer area inheritance:
	// First pass: collect any non-empty canonical area for each customer
	for _, it := range items {
		normArea := NormalizeArea(it.Area)
		if normArea != "" && it.Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(it.Customer))
			if _, exists := customerAreaMap[custKey]; !exists {
				customerAreaMap[custKey] = normArea
			}
		}
	}

	// Second pass: backfill empty area from matching customer
	for i := range items {
		if items[i].Area == "" && items[i].Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(items[i].Customer))
			if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
				items[i].Area = knownArea
			}
		}
	}

	return items
}

// GroupOrders aggregates a slice of normalized items into discrete orders based on
// customer and date order boundaries, assigning sequential order IDs (e.g. ORD-0001).
func GroupOrders(items []model.NormalizedItem) []model.Order {
	if len(items) == 0 {
		return []model.Order{}
	}

	var orders []model.Order
	var currentOrder *model.Order

	for _, item := range items {
		itemArea := NormalizeArea(item.Area)
		// If item matches the current order's customer and date, append to it
		if currentOrder != nil && item.Customer == currentOrder.Customer && item.Tanggal.Equal(currentOrder.Tanggal) {
			if currentOrder.Area == "" && itemArea != "" {
				currentOrder.Area = itemArea
			}
			if currentOrder.OrderNumber == "" && item.OrderNumber != "" {
				currentOrder.OrderNumber = item.OrderNumber
				currentOrder.EcatalogNumber = item.OrderNumber
			}
			currentOrder.Items = append(currentOrder.Items, toOrderItem(item))
			continue
		}

		// Save the completed order
		if currentOrder != nil {
			finalizeOrder(currentOrder)
			orders = append(orders, *currentOrder)
		}

		// Start a new order
		orderID := fmt.Sprintf("ORD-%04d", len(orders)+1)
		currentOrder = &model.Order{
			ID:             orderID,
			OrderNumber:    item.OrderNumber,
			EcatalogNumber: item.EcatalogNumber,
			Tanggal:        item.Tanggal,
			Customer:       item.Customer,
			Area:           itemArea,
			Items:          []model.OrderItem{toOrderItem(item)},
		}
	}

	if currentOrder != nil {
		finalizeOrder(currentOrder)
		orders = append(orders, *currentOrder)
	}
	// Guarantee area consistency across grouped orders for the same customer
	customerAreaMap := make(map[string]string)
	for _, ord := range orders {
		normArea := NormalizeArea(ord.Area)
		if normArea != "" && ord.Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
			if _, exists := customerAreaMap[custKey]; !exists {
				customerAreaMap[custKey] = normArea
			}
		}
		for _, it := range ord.Items {
			itArea := NormalizeArea(it.Area)
			if itArea != "" && ord.Customer != "" {
				custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
				if _, exists := customerAreaMap[custKey]; !exists {
					customerAreaMap[custKey] = itArea
				}
			}
		}
	}

	for i := range orders {
		if NormalizeArea(orders[i].Area) == "" && orders[i].Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(orders[i].Customer))
			if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
				orders[i].Area = knownArea
				for j := range orders[i].Items {
					orders[i].Items[j].Area = orders[i].Area
				}
			}
		} else if orders[i].Area != "" {
			for j := range orders[i].Items {
				if orders[i].Items[j].Area == "" {
					orders[i].Items[j].Area = orders[i].Area
				}
			}
		}
	}

	return orders
}

func finalizeOrder(ord *model.Order) {
	if ord == nil {
		return
	}
	ord.Area = NormalizeArea(ord.Area)
	if ord.Area == "" {
		for _, item := range ord.Items {
			if a := NormalizeArea(item.Area); a != "" {
				ord.Area = a
				break
			}
		}
	}
	if ord.Area != "" {
		for i := range ord.Items {
			if ord.Items[i].Area == "" {
				ord.Items[i].Area = ord.Area
			}
		}
	}
	epCode := ord.OrderNumber
	if epCode == "" {
		for _, item := range ord.Items {
			if item.OrderNumber != "" {
				epCode = item.OrderNumber
				break
			}
			if item.EcatalogNumber != "" {
				epCode = item.EcatalogNumber
				break
			}
		}
	}
	if epCode != "" {
		ord.OrderNumber = epCode
		ord.EcatalogNumber = epCode
		for i := range ord.Items {
			ord.Items[i].OrderNumber = epCode
			ord.Items[i].EcatalogNumber = epCode
		}
	}
}

// toOrderItem maps a NormalizedItem to an OrderItem.
func toOrderItem(item model.NormalizedItem) model.OrderItem {
	return model.OrderItem{
		RowIndex:           item.RowIndex,
		OrderNumber:        item.OrderNumber,
		EcatalogNumber:     item.EcatalogNumber,
		Area:               item.Area,
		NamaBarang:         item.NamaBarang,
		Jumlah:             item.Jumlah,
		Satuan:             item.Satuan,
		TanggalPengiriman:  item.TanggalPengiriman,
		LeadTimePengiriman: item.LeadTimePengiriman,
		JumlahTerkirim:     item.JumlahTerkirim,
		BelumTerkirim:      item.BelumTerkirim,
		StatusOrder:        NormalizeStatusOrder(item.StatusOrder),
		StatusBarang:       item.StatusBarang,
		Keterangan:         item.Keterangan,
		Catatan:            item.Catatan,
	}
}
