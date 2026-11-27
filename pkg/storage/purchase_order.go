package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

// SyncPurchaseOrders atomically replaces all stored purchase order items.
func (s *Storage) SyncPurchaseOrders(ctx context.Context, items []model.PurchaseOrderItem) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin purchase order sync transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `DELETE FROM purchase_order_items`); err != nil {
		return fmt.Errorf("failed to clear purchase_order_items: %w", err)
	}

	if len(items) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO purchase_order_items (
				row_index, tanggal, pemasok, kode_barang, nie, nama_barang,
				jumlah, satuan, status_order, keterangan, clients_json, is_stock, catatan
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return fmt.Errorf("failed to prepare purchase order insert: %w", err)
		}
		defer stmt.Close()

		for _, item := range items {
			var tanggalStr string
			if !item.Tanggal.IsZero() {
				tanggalStr = item.Tanggal.UTC().Format("2006-01-02")
			}

			clients := item.Clients
			if clients == nil {
				clients = []string{}
			}
			clientsBytes, err := json.Marshal(clients)
			if err != nil {
				return fmt.Errorf("failed to marshal purchase order clients: %w", err)
			}

			isStockInt := 0
			if item.IsStock {
				isStockInt = 1
			}

			if _, err := stmt.ExecContext(ctx,
				item.RowIndex,
				tanggalStr,
				item.Pemasok,
				item.KodeBarang,
				item.NIE,
				item.NamaBarang,
				item.Jumlah,
				item.Satuan,
				item.StatusOrder,
				item.Keterangan,
				string(clientsBytes),
				isStockInt,
				item.Catatan,
			); err != nil {
				return fmt.Errorf("failed to insert purchase order item (row %d): %w", item.RowIndex, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit purchase order sync: %w", err)
	}
	return nil
}

func purchaseOrderSortSQL(sortField, direction string) string {
	dir := normalizedSortDirection(direction)
	switch strings.ToLower(strings.TrimSpace(sortField)) {
	case "pemasok":
		return fmt.Sprintf("LOWER(pemasok) %s, tanggal DESC, row_index ASC", dir)
	case "nama_barang":
		return fmt.Sprintf("LOWER(nama_barang) %s, tanggal DESC, row_index ASC", dir)
	case "status_order":
		return fmt.Sprintf("LOWER(status_order) %s, tanggal DESC, row_index ASC", dir)
	default:
		return fmt.Sprintf("tanggal %s, row_index ASC", dir)
	}
}

// GetPurchaseOrderItems retrieves purchase order items matching the filter criteria,
// along with global stats, distinct suppliers, and distinct statuses.
func (s *Storage) GetPurchaseOrderItems(ctx context.Context, filter model.PurchaseOrderFilter) (*model.PurchaseOrderListResponse, error) {
	var conditions []string
	var args []any

	if q := strings.TrimSpace(filter.Query); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		conditions = append(conditions, `(
			LOWER(nama_barang) LIKE ? OR
			LOWER(pemasok) LIKE ? OR
			LOWER(kode_barang) LIKE ? OR
			LOWER(nie) LIKE ? OR
			LOWER(keterangan) LIKE ? OR
			LOWER(catatan) LIKE ?
		)`)
		args = append(args, like, like, like, like, like, like)
	}

	if supplier := strings.TrimSpace(filter.Supplier); supplier != "" {
		conditions = append(conditions, `TRIM(pemasok) = ?`)
		args = append(args, supplier)
	}

	if status := strings.TrimSpace(filter.Status); status != "" {
		if status == "__EMPTY__" || strings.EqualFold(status, "DIPESAN") {
			conditions = append(conditions, `status_order = ''`)
		} else {
			conditions = append(conditions, `LOWER(status_order) = LOWER(?)`)
			args = append(args, status)
		}
	}

	switch strings.ToLower(strings.TrimSpace(filter.Type)) {
	case "stock":
		conditions = append(conditions, `is_stock = 1`)
	case "client":
		conditions = append(conditions, `keterangan != '' AND UPPER(TRIM(keterangan)) NOT IN ('STOK', 'STOCK')`)
	}

	if from := strings.TrimSpace(filter.From); from != "" {
		conditions = append(conditions, `tanggal >= ?`)
		args = append(args, from)
	}

	if to := strings.TrimSpace(filter.To); to != "" {
		conditions = append(conditions, `tanggal <= ?`)
		args = append(args, to)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count matching rows
	var total int
	countQuery := "SELECT COUNT(*) FROM purchase_order_items " + whereClause
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count purchase order items: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	orderBy := purchaseOrderSortSQL(filter.Sort, filter.Order)
	query := fmt.Sprintf(`
		SELECT id, row_index, tanggal, pemasok, kode_barang, nie, nama_barang,
		       jumlah, satuan, status_order, keterangan, clients_json, is_stock, catatan
		FROM purchase_order_items
		%s
		ORDER BY %s
		LIMIT ? OFFSET ?
	`, whereClause, orderBy)

	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := s.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to query purchase order items: %w", err)
	}
	defer rows.Close()

	items := []model.PurchaseOrderItem{}
	for rows.Next() {
		var item model.PurchaseOrderItem
		var tanggalStr string
		var clientsJSON string
		var isStockInt int
		if err := rows.Scan(
			&item.ID,
			&item.RowIndex,
			&tanggalStr,
			&item.Pemasok,
			&item.KodeBarang,
			&item.NIE,
			&item.NamaBarang,
			&item.Jumlah,
			&item.Satuan,
			&item.StatusOrder,
			&item.Keterangan,
			&clientsJSON,
			&isStockInt,
			&item.Catatan,
		); err != nil {
			return nil, fmt.Errorf("failed to scan purchase order item: %w", err)
		}
		item.Tanggal = model.ParseDate(tanggalStr)
		item.IsStock = isStockInt != 0
		var clients []string
		if clientsJSON != "" {
			_ = json.Unmarshal([]byte(clientsJSON), &clients)
		}
		if clients == nil {
			clients = []string{}
		}
		item.Clients = clients
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating purchase order items: %w", err)
	}

	// Global stats over all stored purchase order items
	var stats model.PurchaseOrderStats
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN is_stock = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN keterangan != '' AND UPPER(TRIM(keterangan)) NOT IN ('STOK', 'STOCK') THEN 1 ELSE 0 END), 0),
			COUNT(DISTINCT CASE WHEN TRIM(pemasok) != '' THEN TRIM(pemasok) END)
		FROM purchase_order_items
	`).Scan(&stats.Total, &stats.StockItems, &stats.ClientItems, &stats.SuppliersCount); err != nil {
		return nil, fmt.Errorf("failed to compute purchase order stats: %w", err)
	}

	// Distinct non-empty suppliers (sorted)
	suppliers := []string{}
	supRows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT TRIM(pemasok) AS s
		FROM purchase_order_items
		WHERE TRIM(pemasok) != ''
		ORDER BY LOWER(s) ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query purchase order suppliers: %w", err)
	}
	defer supRows.Close()
	for supRows.Next() {
		var sup string
		if err := supRows.Scan(&sup); err != nil {
			return nil, fmt.Errorf("failed to scan supplier: %w", err)
		}
		suppliers = append(suppliers, sup)
	}

	// Distinct non-empty statuses (sorted)
	statuses := []string{}
	stRows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT TRIM(status_order) AS st
		FROM purchase_order_items
		WHERE TRIM(status_order) != ''
		ORDER BY LOWER(st) ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query purchase order statuses: %w", err)
	}
	defer stRows.Close()
	for stRows.Next() {
		var st string
		if err := stRows.Scan(&st); err != nil {
			return nil, fmt.Errorf("failed to scan status: %w", err)
		}
		statuses = append(statuses, st)
	}

	return &model.PurchaseOrderListResponse{
		Items:     items,
		Total:     total,
		Limit:     limit,
		Offset:    offset,
		Stats:     stats,
		Suppliers: suppliers,
		Statuses:  statuses,
	}, nil
}
