// Package normalizer handles data normalization, forward filling, and order grouping
// for warehouse spreadsheet rows.
package normalizer

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

var (
	epRegex               = regexp.MustCompile(`(?i)\bEP-[A-Z0-9]+\b`)
	custEPWithParensRegex = regexp.MustCompile(`(?i)(?:\s*[(\[]\s*EP-[A-Z0-9]+\s*[)\]]|\s*EP-[A-Z0-9]+)`)
)

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
		currentTanggal     string
		currentCustomer    string
		currentArea        string
		currentOrderNumber string
	)

	items := make([]model.NormalizedItem, 0, len(rawRows))

	for i, raw := range rawRows {
		trimmedTanggal := strings.TrimSpace(raw.Tanggal)
		if trimmedTanggal != "" {
			if trimmedTanggal != currentTanggal && currentCustomer == "" {
				currentOrderNumber = ""
			}
			currentTanggal = trimmedTanggal
		}

		cleanCust, epFromCust := extractAndCleanCustomer(raw.Customer)
		trimmedArea := strings.TrimSpace(raw.Area)

		if cleanCust != "" {
			currentCustomer = cleanCust
			if trimmedArea != "" {
				currentArea = trimmedArea
			} else {
				currentArea = ""
			}
			currentOrderNumber = epFromCust
		} else if epFromCust != "" {
			// Customer field was standalone EP-...! Do NOT overwrite currentCustomer with empty.
			// Inherit currentCustomer and currentArea.
			currentOrderNumber = epFromCust
			if trimmedArea != "" {
				currentArea = trimmedArea
			}
		} else if trimmedArea != "" {
			currentArea = trimmedArea
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
			StatusOrder:        strings.TrimSpace(raw.StatusOrder),
			StatusBarang:       strings.TrimSpace(raw.StatusBarang),
			Keterangan:         strings.TrimSpace(raw.Keterangan),
			Catatan:            strings.TrimSpace(raw.Catatan),
		})
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
		// If item matches the current order's customer and date, append to it
		if currentOrder != nil && item.Customer == currentOrder.Customer && item.Tanggal == currentOrder.Tanggal {
			if currentOrder.Area == "" && item.Area != "" {
				currentOrder.Area = item.Area
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
			Area:           item.Area,
			Items:          []model.OrderItem{toOrderItem(item)},
		}
	}

	if currentOrder != nil {
		finalizeOrder(currentOrder)
		orders = append(orders, *currentOrder)
	}

	return orders
}

func finalizeOrder(ord *model.Order) {
	if ord == nil {
		return
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
		NamaBarang:         item.NamaBarang,
		Jumlah:             item.Jumlah,
		Satuan:             item.Satuan,
		TanggalPengiriman:  item.TanggalPengiriman,
		LeadTimePengiriman: item.LeadTimePengiriman,
		JumlahTerkirim:     item.JumlahTerkirim,
		BelumTerkirim:      item.BelumTerkirim,
		StatusOrder:        item.StatusOrder,
		StatusBarang:       item.StatusBarang,
		Keterangan:         item.Keterangan,
		Catatan:            item.Catatan,
	}
}
