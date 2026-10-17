// Package storage provides SQLite database persistence and querying
// for warehouse orders, line items, and sync history.
package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/normalizer"
	_ "modernc.org/sqlite"
)

// Storage wraps a SQLite database handle.
type Storage struct {
	db *sql.DB
}

// OrderFilter defines filtering criteria for order queries.
type OrderFilter struct {
	Customer       string `json:"customer"`
	Date           string `json:"date"`
	Tanggal        string `json:"tanggal"`
	Area           string `json:"area"`
	OrderNumber    string `json:"order_number"`
	EcatalogNumber string `json:"ecatalog_number"`
	Limit          int    `json:"limit"`
	Offset         int    `json:"offset"`
}

// ItemFilter defines filtering criteria for item queries.
type ItemFilter struct {
	Customer       string `json:"customer"`
	NamaBarang     string `json:"nama_barang"`
	StatusOrder    string `json:"status_order"`
	Date           string `json:"date"`
	Tanggal        string `json:"tanggal"`
	OrderNumber    string `json:"order_number"`
	EcatalogNumber string `json:"ecatalog_number"`
	Limit          int    `json:"limit"`
	Offset         int    `json:"offset"`
}

// Stats contains aggregated metrics about stored orders and items.
type Stats struct {
	TotalOrders     int            `json:"total_orders"`
	TotalItems      int            `json:"total_items"`
	UniqueCustomers int            `json:"unique_customers"`
	UniqueAreas     int            `json:"unique_areas"`
	StatusCounts    map[string]int `json:"status_counts"`
}

// SyncRecord represents an entry in the sync_history table.
type SyncRecord struct {
	ID           int64     `json:"id"`
	SyncedAt     time.Time `json:"synced_at"`
	Status       string    `json:"status"`
	ItemsCount   int       `json:"items_count"`
	OrdersCount  int       `json:"orders_count"`
	ErrorMessage string    `json:"error_message,omitempty"`
}

// New opens a SQLite database at dbPath with WAL mode and busy timeout pragmas,
// and automatically migrates the required schema.
func New(dbPath string) (*Storage, error) {
	dsn := dbPath
	if !strings.Contains(dbPath, "_pragma=journal_mode") && !strings.Contains(dbPath, "_pragma=busy_timeout") {
		sep := "?"
		if strings.Contains(dbPath, "?") {
			sep = "&"
		}
		dsn = fmt.Sprintf("%s%s_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", dbPath, sep)
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// For in-memory databases, ensure all queries reuse the same connection instance
	if strings.HasPrefix(dbPath, ":memory:") || strings.Contains(dbPath, "mode=memory") {
		db.SetMaxOpenConns(1)
	}

	s := &Storage{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to migrate tables: %w", err)
	}

	return s, nil
}

// DB returns the underlying sql.DB connection.
func (s *Storage) DB() *sql.DB {
	return s.db
}

// Close closes the database handle.
func (s *Storage) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Storage) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS orders (
		id TEXT PRIMARY KEY,
		order_number TEXT,
		ecatalog_number TEXT,
		tanggal TEXT,
		customer TEXT,
		area TEXT,
		total_items INTEGER,
		updated_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		row_index INTEGER,
		order_id TEXT,
		order_number TEXT,
		ecatalog_number TEXT,
		tanggal TEXT,
		customer TEXT,
		area TEXT,
		nama_barang TEXT,
		jumlah TEXT,
		satuan TEXT,
		tanggal_pengiriman TEXT,
		lead_time_pengiriman TEXT,
		jumlah_terkirim TEXT,
		belum_terkirim TEXT,
		status_order TEXT,
		status_barang TEXT,
		keterangan TEXT,
		catatan TEXT
	);

	CREATE TABLE IF NOT EXISTS sync_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		synced_at DATETIME,
		status TEXT,
		items_count INTEGER,
		orders_count INTEGER,
		error_message TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer);
	CREATE INDEX IF NOT EXISTS idx_orders_tanggal ON orders(tanggal);
	CREATE INDEX IF NOT EXISTS idx_orders_area ON orders(area);
	CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

	CREATE INDEX IF NOT EXISTS idx_items_order_id ON items(order_id);
	CREATE INDEX IF NOT EXISTS idx_items_order_number ON items(order_number);
	CREATE INDEX IF NOT EXISTS idx_items_customer ON items(customer);
	CREATE INDEX IF NOT EXISTS idx_items_nama_barang ON items(nama_barang);
	CREATE INDEX IF NOT EXISTS idx_items_status_order ON items(status_order);
	CREATE INDEX IF NOT EXISTS idx_items_tanggal ON items(tanggal);
	`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}

	// In case tables were created with an earlier schema version without order_number
	_, _ = s.db.Exec(`ALTER TABLE orders ADD COLUMN order_number TEXT;`)
	_, _ = s.db.Exec(`ALTER TABLE orders ADD COLUMN ecatalog_number TEXT;`)
	_, _ = s.db.Exec(`ALTER TABLE items ADD COLUMN order_number TEXT;`)
	_, _ = s.db.Exec(`ALTER TABLE items ADD COLUMN ecatalog_number TEXT;`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_items_order_number ON items(order_number);`)

	return nil
}

// SyncMirror replaces all existing items and orders with remote items and orders
// in a single atomic transaction. If anything fails, changes are rolled back.
func (s *Storage) SyncMirror(ctx context.Context, items []model.NormalizedItem, orders []model.Order) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Clear existing items and orders
	if _, err := tx.ExecContext(ctx, "DELETE FROM items"); err != nil {
		return fmt.Errorf("failed to clear existing items: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM orders"); err != nil {
		return fmt.Errorf("failed to clear existing orders: %w", err)
	}

	// Auto-group orders if orders slice is empty but items are provided
	if len(orders) == 0 && len(items) > 0 {
		orders = normalizer.GroupOrders(items)
	}

	// Build map from row index to order ID
	orderIDByRowIndex := make(map[int]string, len(items))
	for _, ord := range orders {
		for _, oi := range ord.Items {
			if oi.RowIndex > 0 {
				orderIDByRowIndex[oi.RowIndex] = ord.ID
			}
		}
	}

	// Helper to resolve order ID for a normalized item
	resolveOrderID := func(it model.NormalizedItem) string {
		if it.RowIndex > 0 {
			if id, ok := orderIDByRowIndex[it.RowIndex]; ok {
				return id
			}
		}
		for _, ord := range orders {
			if ord.Customer == it.Customer && ord.Tanggal == it.Tanggal {
				return ord.ID
			}
		}
		return ""
	}

	// Calculate item counts per order
	orderItemCounts := make(map[string]int, len(orders))
	for _, ord := range orders {
		orderItemCounts[ord.ID] = len(ord.Items)
	}
	if len(items) > 0 {
		counts := make(map[string]int)
		for _, it := range items {
			ordID := resolveOrderID(it)
			if ordID != "" {
				counts[ordID]++
			}
		}
		for ordID, count := range counts {
			orderItemCounts[ordID] = count
		}
	}

	now := time.Now().UTC()

	orderByID := make(map[string]model.Order, len(orders))
	for _, ord := range orders {
		orderByID[ord.ID] = ord
	}

	// Insert orders
	orderStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO orders (id, order_number, ecatalog_number, tanggal, customer, area, total_items, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare order insert statement: %w", err)
	}
	defer orderStmt.Close()

	for _, ord := range orders {
		total := orderItemCounts[ord.ID]
		if total == 0 && len(ord.Items) > 0 {
			total = len(ord.Items)
		}
		if _, err := orderStmt.ExecContext(ctx, ord.ID, ord.OrderNumber, ord.EcatalogNumber, ord.Tanggal, ord.Customer, ord.Area, total, now); err != nil {
			return fmt.Errorf("failed to insert order %s: %w", ord.ID, err)
		}
	}

	// Insert items
	itemStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO items (
			row_index, order_id, order_number, ecatalog_number, tanggal, customer, area,
			nama_barang, jumlah, satuan, tanggal_pengiriman,
			lead_time_pengiriman, jumlah_terkirim, belum_terkirim,
			status_order, status_barang, keterangan, catatan
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare item insert statement: %w", err)
	}
	defer itemStmt.Close()

	totalItemsCount := 0
	if len(items) > 0 {
		totalItemsCount = len(items)
		for _, it := range items {
			ordID := resolveOrderID(it)
			orderNum := it.OrderNumber
			ecatNum := it.EcatalogNumber
			if ord, ok := orderByID[ordID]; ok {
				if orderNum == "" {
					orderNum = ord.OrderNumber
				}
				if ecatNum == "" {
					ecatNum = ord.EcatalogNumber
				}
			}
			if _, err := itemStmt.ExecContext(ctx,
				it.RowIndex, ordID, orderNum, ecatNum, it.Tanggal, it.Customer, it.Area,
				it.NamaBarang, it.Jumlah, it.Satuan, it.TanggalPengiriman,
				it.LeadTimePengiriman, it.JumlahTerkirim, it.BelumTerkirim,
				it.StatusOrder, it.StatusBarang, it.Keterangan, it.Catatan,
			); err != nil {
				return fmt.Errorf("failed to insert item (row %d): %w", it.RowIndex, err)
			}
		}
	} else {
		// Populate from orders if items slice is empty
		for _, ord := range orders {
			for _, oi := range ord.Items {
				totalItemsCount++
				orderNum := oi.OrderNumber
				if orderNum == "" {
					orderNum = ord.OrderNumber
				}
				ecatNum := oi.EcatalogNumber
				if ecatNum == "" {
					ecatNum = ord.EcatalogNumber
				}
				if _, err := itemStmt.ExecContext(ctx,
					oi.RowIndex, ord.ID, orderNum, ecatNum, ord.Tanggal, ord.Customer, ord.Area,
					oi.NamaBarang, oi.Jumlah, oi.Satuan, oi.TanggalPengiriman,
					oi.LeadTimePengiriman, oi.JumlahTerkirim, oi.BelumTerkirim,
					oi.StatusOrder, oi.StatusBarang, oi.Keterangan, oi.Catatan,
				); err != nil {
					return fmt.Errorf("failed to insert order item (order %s, row %d): %w", ord.ID, oi.RowIndex, err)
				}
			}
		}
	}

	// Record sync history in the same transaction
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_history (synced_at, status, items_count, orders_count, error_message)
		VALUES (?, ?, ?, ?, ?)
	`, now, "SUCCESS", totalItemsCount, len(orders), ""); err != nil {
		return fmt.Errorf("failed to record sync history: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit sync transaction: %w", err)
	}

	return nil
}

// RecordSync records a standalone sync history entry (e.g. for sync failures).
func (s *Storage) RecordSync(ctx context.Context, status string, itemsCount, ordersCount int, errMsg string) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sync_history (synced_at, status, items_count, orders_count, error_message)
		VALUES (?, ?, ?, ?, ?)
	`, now, status, itemsCount, ordersCount, errMsg)
	if err != nil {
		return fmt.Errorf("failed to record sync: %w", err)
	}
	return nil
}

// GetOrders retrieves orders matching the filter criteria with pagination support.
// Returns matched orders slice, total count before pagination, and any error.
func (s *Storage) GetOrders(ctx context.Context, filter OrderFilter) ([]model.Order, int, error) {
	var conditions []string
	var args []any

	if filter.Customer != "" {
		conditions = append(conditions, "customer LIKE ?")
		args = append(args, "%"+filter.Customer+"%")
	}

	date := filter.Date
	if date == "" {
		date = filter.Tanggal
	}
	if date != "" {
		conditions = append(conditions, "tanggal LIKE ?")
		args = append(args, "%"+date+"%")
	}

	if filter.Area != "" {
		conditions = append(conditions, "area LIKE ?")
		args = append(args, "%"+filter.Area+"%")
	}

	orderNum := filter.OrderNumber
	if orderNum == "" {
		orderNum = filter.EcatalogNumber
	}
	if orderNum != "" {
		conditions = append(conditions, "order_number = ?")
		args = append(args, orderNum)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := "SELECT COUNT(*) FROM orders" + whereClause
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count orders: %w", err)
	}
	if total == 0 {
		return []model.Order{}, 0, nil
	}

	selectQuery := "SELECT id, order_number, ecatalog_number, tanggal, customer, area FROM orders" + whereClause + " ORDER BY id"
	queryArgs := append([]any{}, args...)
	if filter.Limit > 0 {
		selectQuery += " LIMIT ?"
		queryArgs = append(queryArgs, filter.Limit)
		if filter.Offset > 0 {
			selectQuery += " OFFSET ?"
			queryArgs = append(queryArgs, filter.Offset)
		}
	} else if filter.Offset > 0 {
		selectQuery += " LIMIT -1 OFFSET ?"
		queryArgs = append(queryArgs, filter.Offset)
	}

	rows, err := s.db.QueryContext(ctx, selectQuery, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query orders: %w", err)
	}
	defer rows.Close()

	var orders []model.Order
	var orderIDs []string
	for rows.Next() {
		var ord model.Order
		var orderNumber, ecatalogNumber sql.NullString
		if err := rows.Scan(&ord.ID, &orderNumber, &ecatalogNumber, &ord.Tanggal, &ord.Customer, &ord.Area); err != nil {
			return nil, 0, fmt.Errorf("failed to scan order row: %w", err)
		}
		ord.OrderNumber = orderNumber.String
		ord.EcatalogNumber = ecatalogNumber.String
		ord.Items = []model.OrderItem{}
		orders = append(orders, ord)
		orderIDs = append(orderIDs, ord.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading order rows: %w", err)
	}

	// Fetch items for the retrieved orders
	if len(orderIDs) > 0 {
		placeholders := make([]string, len(orderIDs))
		idArgs := make([]any, len(orderIDs))
		for i, id := range orderIDs {
			placeholders[i] = "?"
			idArgs[i] = id
		}
		itemQuery := fmt.Sprintf(`
			SELECT order_id, row_index, order_number, ecatalog_number, nama_barang, jumlah, satuan, tanggal_pengiriman,
			       lead_time_pengiriman, jumlah_terkirim, belum_terkirim, status_order,
			       status_barang, keterangan, catatan
			FROM items
			WHERE order_id IN (%s)
			ORDER BY id
		`, strings.Join(placeholders, ","))

		itemRows, err := s.db.QueryContext(ctx, itemQuery, idArgs...)
		if err == nil {
			defer itemRows.Close()
			orderItemMap := make(map[string][]model.OrderItem)
			for itemRows.Next() {
				var orderID string
				var oi model.OrderItem
				var itemOrderNum, itemEcatNum sql.NullString
				if err := itemRows.Scan(
					&orderID, &oi.RowIndex, &itemOrderNum, &itemEcatNum, &oi.NamaBarang, &oi.Jumlah, &oi.Satuan,
					&oi.TanggalPengiriman, &oi.LeadTimePengiriman, &oi.JumlahTerkirim,
					&oi.BelumTerkirim, &oi.StatusOrder, &oi.StatusBarang,
					&oi.Keterangan, &oi.Catatan,
				); err == nil {
					oi.OrderNumber = itemOrderNum.String
					oi.EcatalogNumber = itemEcatNum.String
					orderItemMap[orderID] = append(orderItemMap[orderID], oi)
				}
			}
			for i := range orders {
				if its, ok := orderItemMap[orders[i].ID]; ok {
					orders[i].Items = its
				}
			}
		}
	}

	return orders, total, nil
}

// GetOrderByID retrieves an order and its associated line items by order ID.
func (s *Storage) GetOrderByID(ctx context.Context, id string) (*model.Order, error) {
	var ord model.Order
	var orderNumber, ecatalogNumber sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, order_number, ecatalog_number, tanggal, customer, area
		FROM orders
		WHERE id = ?
	`, id).Scan(&ord.ID, &orderNumber, &ecatalogNumber, &ord.Tanggal, &ord.Customer, &ord.Area)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("order %q not found: %w", id, sql.ErrNoRows)
		}
		return nil, fmt.Errorf("failed to query order %q: %w", id, err)
	}
	ord.OrderNumber = orderNumber.String
	ord.EcatalogNumber = ecatalogNumber.String

	rows, err := s.db.QueryContext(ctx, `
		SELECT row_index, order_number, ecatalog_number, nama_barang, jumlah, satuan, tanggal_pengiriman,
		       lead_time_pengiriman, jumlah_terkirim, belum_terkirim, status_order,
		       status_barang, keterangan, catatan
		FROM items
		WHERE order_id = ?
		ORDER BY id
	`, id)
	if err != nil {
		return nil, fmt.Errorf("failed to query items for order %q: %w", id, err)
	}
	defer rows.Close()

	ord.Items = []model.OrderItem{}
	for rows.Next() {
		var it model.OrderItem
		var itemOrderNum, itemEcatNum sql.NullString
		if err := rows.Scan(
			&it.RowIndex, &itemOrderNum, &itemEcatNum, &it.NamaBarang, &it.Jumlah, &it.Satuan,
			&it.TanggalPengiriman, &it.LeadTimePengiriman, &it.JumlahTerkirim,
			&it.BelumTerkirim, &it.StatusOrder, &it.StatusBarang,
			&it.Keterangan, &it.Catatan,
		); err != nil {
			return nil, fmt.Errorf("failed to scan item for order %q: %w", id, err)
		}
		it.OrderNumber = itemOrderNum.String
		it.EcatalogNumber = itemEcatNum.String
		ord.Items = append(ord.Items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading items for order %q: %w", id, err)
	}

	return &ord, nil
}

// GetItems retrieves normalized items matching the filter criteria with pagination support.
// Returns matched items slice, total count before pagination, and any error.
func (s *Storage) GetItems(ctx context.Context, filter ItemFilter) ([]model.NormalizedItem, int, error) {
	var conditions []string
	var args []any

	if filter.Customer != "" {
		conditions = append(conditions, "customer LIKE ?")
		args = append(args, "%"+filter.Customer+"%")
	}
	if filter.NamaBarang != "" {
		conditions = append(conditions, "nama_barang LIKE ?")
		args = append(args, "%"+filter.NamaBarang+"%")
	}
	if filter.StatusOrder != "" {
		conditions = append(conditions, "status_order LIKE ?")
		args = append(args, "%"+filter.StatusOrder+"%")
	}

	date := filter.Date
	if date == "" {
		date = filter.Tanggal
	}
	if date != "" {
		conditions = append(conditions, "tanggal LIKE ?")
		args = append(args, "%"+date+"%")
	}

	orderNum := filter.OrderNumber
	if orderNum == "" {
		orderNum = filter.EcatalogNumber
	}
	if orderNum != "" {
		conditions = append(conditions, "order_number = ?")
		args = append(args, orderNum)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := "SELECT COUNT(*) FROM items" + whereClause
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count items: %w", err)
	}
	if total == 0 {
		return []model.NormalizedItem{}, 0, nil
	}

	selectQuery := `
		SELECT row_index, order_number, ecatalog_number, tanggal, customer, area, nama_barang, jumlah, satuan,
		       tanggal_pengiriman, lead_time_pengiriman, jumlah_terkirim, belum_terkirim,
		       status_order, status_barang, keterangan, catatan
		FROM items
	` + whereClause + " ORDER BY id"

	queryArgs := append([]any{}, args...)
	if filter.Limit > 0 {
		selectQuery += " LIMIT ?"
		queryArgs = append(queryArgs, filter.Limit)
		if filter.Offset > 0 {
			selectQuery += " OFFSET ?"
			queryArgs = append(queryArgs, filter.Offset)
		}
	} else if filter.Offset > 0 {
		selectQuery += " LIMIT -1 OFFSET ?"
		queryArgs = append(queryArgs, filter.Offset)
	}

	rows, err := s.db.QueryContext(ctx, selectQuery, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query items: %w", err)
	}
	defer rows.Close()

	var items []model.NormalizedItem
	for rows.Next() {
		var it model.NormalizedItem
		var itemOrderNum, itemEcatNum sql.NullString
		if err := rows.Scan(
			&it.RowIndex, &itemOrderNum, &itemEcatNum, &it.Tanggal, &it.Customer, &it.Area, &it.NamaBarang,
			&it.Jumlah, &it.Satuan, &it.TanggalPengiriman, &it.LeadTimePengiriman,
			&it.JumlahTerkirim, &it.BelumTerkirim, &it.StatusOrder, &it.StatusBarang,
			&it.Keterangan, &it.Catatan,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan item row: %w", err)
		}
		it.OrderNumber = itemOrderNum.String
		it.EcatalogNumber = itemEcatNum.String
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading item rows: %w", err)
	}

	return items, total, nil
}

// GetStats returns aggregated statistics including order count, item count,
// unique customer count, unique area count, and status breakdown.
func (s *Storage) GetStats(ctx context.Context) (*Stats, error) {
	stats := &Stats{
		StatusCounts: make(map[string]int),
	}

	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM orders").Scan(&stats.TotalOrders); err != nil {
		return nil, fmt.Errorf("failed to count orders: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM items").Scan(&stats.TotalItems); err != nil {
		return nil, fmt.Errorf("failed to count items: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT customer) FROM orders WHERE customer != ''").Scan(&stats.UniqueCustomers); err != nil {
		return nil, fmt.Errorf("failed to count unique customers: %w", err)
	}
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT area) FROM orders WHERE area != ''").Scan(&stats.UniqueAreas)

	rows, err := s.db.QueryContext(ctx, "SELECT status_order, COUNT(*) FROM items WHERE status_order != '' GROUP BY status_order")
	if err != nil {
		return nil, fmt.Errorf("failed to query status counts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("failed to scan status count: %w", err)
		}
		stats.StatusCounts[status] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading status count rows: %w", err)
	}

	return stats, nil
}

// GetLastSync returns the most recent sync history record, or nil if no sync has occurred.
func (s *Storage) GetLastSync(ctx context.Context) (*SyncRecord, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, synced_at, status, items_count, orders_count, error_message
		FROM sync_history
		ORDER BY id DESC
		LIMIT 1
	`)
	var rec SyncRecord
	var errMsg sql.NullString
	if err := row.Scan(&rec.ID, &rec.SyncedAt, &rec.Status, &rec.ItemsCount, &rec.OrdersCount, &errMsg); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query last sync: %w", err)
	}
	rec.ErrorMessage = errMsg.String
	return &rec, nil
}

// HasSynced returns true if the database has at least one successful sync history record.
func (s *Storage) HasSynced(ctx context.Context) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sync_history WHERE status = 'SUCCESS'").Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
