// Package normalizer handles data normalization, forward filling, and order grouping
// for warehouse spreadsheet rows.
package normalizer

import (
	"fmt"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

// NormalizeRows transforms raw order rows into normalized items by applying
// forward-fill rules for Tanggal, Customer, and Area, filtering out empty rows,
// and preserving accurate 1-based sheet row indices.
func NormalizeRows(rawRows []model.RawOrderRow) []model.NormalizedItem {
	var (
		currentTanggal  string
		currentCustomer string
		currentArea     string
	)

	items := make([]model.NormalizedItem, 0, len(rawRows))

	for i, raw := range rawRows {
		trimmedTanggal := strings.TrimSpace(raw.Tanggal)
		if trimmedTanggal != "" {
			currentTanggal = trimmedTanggal
		}

		trimmedCustomer := strings.TrimSpace(raw.Customer)
		trimmedArea := strings.TrimSpace(raw.Area)

		if trimmedCustomer != "" {
			currentCustomer = trimmedCustomer
			if trimmedArea != "" {
				currentArea = trimmedArea
			} else {
				currentArea = ""
			}
		} else if trimmedArea != "" {
			currentArea = trimmedArea
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
			currentOrder.Items = append(currentOrder.Items, toOrderItem(item))
			continue
		}

		// Save the completed order
		if currentOrder != nil {
			orders = append(orders, *currentOrder)
		}

		// Start a new order
		orderID := fmt.Sprintf("ORD-%04d", len(orders)+1)
		currentOrder = &model.Order{
			ID:       orderID,
			Tanggal:  item.Tanggal,
			Customer: item.Customer,
			Area:     item.Area,
			Items:    []model.OrderItem{toOrderItem(item)},
		}
	}

	if currentOrder != nil {
		orders = append(orders, *currentOrder)
	}

	return orders
}

// toOrderItem maps a NormalizedItem to an OrderItem.
func toOrderItem(item model.NormalizedItem) model.OrderItem {
	return model.OrderItem{
		RowIndex:           item.RowIndex,
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
