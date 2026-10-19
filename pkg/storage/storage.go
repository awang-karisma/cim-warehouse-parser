// Package storage provides SQLite database persistence and querying
// for warehouse orders, line items, and sync history.
package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
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
	Status         string `json:"status"`
	OrderNumber    string `json:"order_number"`
	EcatalogNumber string `json:"ecatalog_number"`
	Sort           string `json:"sort"`
	Order          string `json:"order"`
	Limit          int    `json:"limit"`
	Offset         int    `json:"offset"`
}

// ItemFilter defines filtering criteria for item queries.
type ItemFilter struct {
	Customer          string `json:"customer"`
	NamaBarang        string `json:"nama_barang"`
	StatusOrder       string `json:"status_order"`
	StatusBarang      string `json:"status_barang"`
	StatusBarangOther bool   `json:"status_barang_other"`
	Date              string `json:"date"`
	Tanggal           string `json:"tanggal"`
	OrderNumber       string `json:"order_number"`
	EcatalogNumber    string `json:"ecatalog_number"`
	Sort              string `json:"sort"`
	Order             string `json:"order"`
	Limit             int    `json:"limit"`
	Offset            int    `json:"offset"`
}

// Delivery represents a single shipment row in the deliveries table.
type Delivery struct {
	ID              int64  `json:"id"`
	ItemID          int64  `json:"item_id"`
	DeliveryDate    string `json:"delivery_date"`
	ShippedQuantity string `json:"shipped_quantity"`
	ShipmentIndex   int    `json:"shipment_index"`
}

// DeliveryItem joins a delivery row with its original normalized line item.
type DeliveryItem struct {
	DeliveryDate    string               `json:"delivery_date"`
	ShippedQuantity string               `json:"shipped_quantity"`
	ShipmentIndex   int                  `json:"shipment_index"`
	ShipmentCount   int                  `json:"shipment_count"`
	Item            model.NormalizedItem `json:"item"`
}

// DeliveryFilter defines criteria for querying shipments.
type DeliveryFilter struct {
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
	DurationMs   int64     `json:"duration_ms"`
}

// CustomerSummary represents aggregated customer statistics.
type CustomerSummary struct {
	Name          string         `json:"name"`
	Area          string         `json:"area"`
	TotalOrders   int            `json:"total_orders"`
	TotalItems    int            `json:"total_items"`
	LastOrderDate string         `json:"last_order_date"`
	StatusCounts  map[string]int `json:"status_counts"`
}

// CustomerAliasGroup groups variant aliases under a canonical customer name and optional linked area.
type CustomerAliasGroup struct {
	Canonical string   `json:"canonical"`
	Area      string   `json:"area,omitempty"`
	Aliases   []string `json:"aliases"`
}

// AreaSummary represents aggregated area statistics.
type AreaSummary struct {
	Name            string         `json:"name"`
	TotalOrders     int            `json:"total_orders"`
	TotalItems      int            `json:"total_items"`
	UniqueCustomers int            `json:"unique_customers"`
	StatusCounts    map[string]int `json:"status_counts"`
}

// TableStat represents table row count metrics.
type TableStat struct {
	RowCount int `json:"row_count"`
}

// SearchResult groups search results across orders, items, and customers.
type SearchResult struct {
	Query     string          `json:"query"`
	Orders    SearchOrders    `json:"orders"`
	Items     SearchItems     `json:"items"`
	Customers SearchCustomers `json:"customers"`
}

// SearchOrders contains matched orders and count.
type SearchOrders struct {
	Total   int                 `json:"total"`
	Results []SearchOrderResult `json:"results"`
}

// SearchOrderResult represents an order matching a search query.
type SearchOrderResult struct {
	ID           string   `json:"id"`
	Customer     string   `json:"customer"`
	Tanggal      string   `json:"tanggal"`
	MatchedItems []string `json:"matched_items"`
}

// SearchItems contains matched items and count.
type SearchItems struct {
	Total   int                `json:"total"`
	Results []SearchItemResult `json:"results"`
}

// SearchItemResult represents a line item matching a search query.
type SearchItemResult struct {
	RowIndex    int    `json:"row_index"`
	Customer    string `json:"customer"`
	NamaBarang  string `json:"nama_barang"`
	Jumlah      string `json:"jumlah"`
	StatusOrder string `json:"status_order"`
}

// SearchCustomers contains matched customers and count.
type SearchCustomers struct {
	Total   int                    `json:"total"`
	Results []SearchCustomerResult `json:"results"`
}

// SearchCustomerResult represents a customer matching a search query.
type SearchCustomerResult struct {
	Name        string `json:"name"`
	Area        string `json:"area"`
	TotalOrders int    `json:"total_orders"`
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
		tanggal DATE,
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
		tanggal DATE,
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
		error_message TEXT,
		duration_ms INTEGER DEFAULT 0
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

	CREATE TABLE IF NOT EXISTS customer_aliases (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
		canonical TEXT NOT NULL,
		area TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias ON customer_aliases(alias);

	CREATE TABLE IF NOT EXISTS deliveries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
		delivery_date TEXT NOT NULL,
		shipped_quantity TEXT NOT NULL,
		shipment_index INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_deliveries_item_id ON deliveries(item_id);
	CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_date ON deliveries(delivery_date);
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
	_, _ = s.db.Exec(`ALTER TABLE sync_history ADD COLUMN duration_ms INTEGER DEFAULT 0;`)
	_, _ = s.db.Exec(`ALTER TABLE customer_aliases ADD COLUMN area TEXT NOT NULL DEFAULT '';`)

	// Migrate legacy DD/MM/YYYY dates in orders and items tables to ISO YYYY-MM-DD
	if err := s.migrateTanggal(); err != nil {
		return fmt.Errorf("failed to migrate tanggal: %w", err)
	}

	// Backfill deliveries from existing items that have no deliveries recorded yet
	bRows, err := s.db.Query(`
		SELECT id, tanggal_pengiriman FROM items
		WHERE id NOT IN (SELECT DISTINCT item_id FROM deliveries)
		  AND tanggal_pengiriman != ''
	`)
	if err == nil {
		type backfillItem struct {
			id       int64
			dateText string
		}
		var toBackfill []backfillItem
		for bRows.Next() {
			var b backfillItem
			if err := bRows.Scan(&b.id, &b.dateText); err == nil {
				toBackfill = append(toBackfill, b)
			}
		}
		bRows.Close()

		if len(toBackfill) > 0 {
			bStmt, err := s.db.Prepare(`
				INSERT INTO deliveries (item_id, delivery_date, shipped_quantity, shipment_index)
				VALUES (?, ?, ?, ?)
			`)
			if err == nil {
				defer bStmt.Close()
				for _, b := range toBackfill {
					entries := normalizer.ParseDeliveryEntries(b.dateText)
					for idx, entry := range entries {
						_, _ = bStmt.Exec(b.id, entry.Date, entry.Quantity, idx)
					}
				}
			}
		}
	}

	// Repair deliveries that have legacy dates or unparsed blob formats
	if err := s.repairDeliveries(); err != nil {
		return fmt.Errorf("failed to repair deliveries: %w", err)
	}
	return nil
}

func parseStoredDate(val any) time.Time {
	if val == nil {
		return time.Time{}
	}
	switch v := val.(type) {
	case time.Time:
		if v.IsZero() {
			return time.Time{}
		}
		return time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
	case *time.Time:
		if v == nil || v.IsZero() {
			return time.Time{}
		}
		return time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return time.Time{}
		}
		return normalizer.ParseDate(trimmed)
	case []byte:
		trimmed := strings.TrimSpace(string(v))
		if trimmed == "" {
			return time.Time{}
		}
		return normalizer.ParseDate(trimmed)
	}
	return time.Time{}
}

func (s *Storage) migrateTanggal() error {
	// 1. Orders
	oRows, err := s.db.Query(`SELECT DISTINCT tanggal FROM orders WHERE tanggal LIKE '%/%'`)
	if err == nil {
		var legacyDates []string
		for oRows.Next() {
			var d string
			if err := oRows.Scan(&d); err == nil && strings.TrimSpace(d) != "" {
				legacyDates = append(legacyDates, d)
			}
		}
		_ = oRows.Close()

		if len(legacyDates) > 0 {
			stmt, err := s.db.Prepare(`UPDATE orders SET tanggal = ? WHERE tanggal = ?`)
			if err == nil {
				defer stmt.Close()
				for _, legacy := range legacyDates {
					parsed := normalizer.ParseDate(legacy)
					if !parsed.IsZero() {
						iso := parsed.Format("2006-01-02")
						_, _ = stmt.Exec(iso, legacy)
					}
				}
			}
		}
	}

	// 2. Items
	iRows, err := s.db.Query(`SELECT DISTINCT tanggal FROM items WHERE tanggal LIKE '%/%'`)
	if err == nil {
		var legacyDates []string
		for iRows.Next() {
			var d string
			if err := iRows.Scan(&d); err == nil && strings.TrimSpace(d) != "" {
				legacyDates = append(legacyDates, d)
			}
		}
		_ = iRows.Close()

		if len(legacyDates) > 0 {
			stmt, err := s.db.Prepare(`UPDATE items SET tanggal = ? WHERE tanggal = ?`)
			if err == nil {
				defer stmt.Close()
				for _, legacy := range legacyDates {
					parsed := normalizer.ParseDate(legacy)
					if !parsed.IsZero() {
						iso := parsed.Format("2006-01-02")
						_, _ = stmt.Exec(iso, legacy)
					}
				}
			}
		}
	}
	return nil
}

// repairDeliveries fixes legacy deliveries that were stored with DD/MM/YYYY dates
// or raw blobs (e.g. including unit text or multiple dates in a single row).
func (s *Storage) repairDeliveries() error {
	rows, err := s.db.Query(`
		SELECT DISTINCT d.item_id, i.tanggal_pengiriman
		FROM deliveries d
		JOIN items i ON d.item_id = i.id
		WHERE d.delivery_date LIKE '%/%'
		   OR d.delivery_date LIKE '%(%'
		   OR d.delivery_date LIKE '%,%'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type repairItem struct {
		itemID            int64
		tanggalPengiriman string
	}
	var itemsToRepair []repairItem
	for rows.Next() {
		var it repairItem
		if err := rows.Scan(&it.itemID, &it.tanggalPengiriman); err == nil {
			itemsToRepair = append(itemsToRepair, it)
		}
	}
	_ = rows.Close()

	if len(itemsToRepair) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	delStmt, err := tx.Prepare(`DELETE FROM deliveries WHERE item_id = ?`)
	if err != nil {
		return err
	}
	defer delStmt.Close()

	insStmt, err := tx.Prepare(`
		INSERT INTO deliveries (item_id, delivery_date, shipped_quantity, shipment_index)
		VALUES (?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer insStmt.Close()

	selStmt, err := tx.Prepare(`
		SELECT delivery_date, shipped_quantity
		FROM deliveries
		WHERE item_id = ?
		ORDER BY shipment_index ASC, id ASC
	`)
	if err != nil {
		return err
	}
	defer selStmt.Close()

	for _, it := range itemsToRepair {
		entries := normalizer.ParseDeliveryEntries(it.tanggalPengiriman)

		dRows, err := selStmt.Query(it.itemID)
		if err != nil {
			continue
		}
		type simpleDel struct {
			date string
			qty  string
		}
		var stored []simpleDel
		for dRows.Next() {
			var sd simpleDel
			if err := dRows.Scan(&sd.date, &sd.qty); err == nil {
				stored = append(stored, sd)
			}
		}
		dRows.Close()

		match := len(stored) == len(entries)
		if match {
			for i := range entries {
				if stored[i].date != entries[i].Date || stored[i].qty != entries[i].Quantity {
					match = false
					break
				}
			}
		}

		if !match {
			if _, err := delStmt.Exec(it.itemID); err != nil {
				return err
			}
			for idx, entry := range entries {
				if _, err := insStmt.Exec(it.itemID, entry.Date, entry.Quantity, idx); err != nil {
					return err
				}
			}
		}
	}

	return tx.Commit()
}

// SyncMirror replaces all existing items and orders with remote items and orders
// in a single atomic transaction. If anything fails, changes are rolled back.
func (s *Storage) SyncMirror(ctx context.Context, items []model.NormalizedItem, orders []model.Order) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Clear existing deliveries, items and orders
	if _, err := tx.ExecContext(ctx, "DELETE FROM deliveries"); err != nil {
		return fmt.Errorf("failed to clear existing deliveries: %w", err)
	}
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
	// Build map of known areas per customer across orders and items in batch
	customerAreaMap := make(map[string]string)
	for _, ord := range orders {
		normArea := normalizer.NormalizeArea(ord.Area)
		if normArea != "" && ord.Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
			if _, exists := customerAreaMap[custKey]; !exists {
				customerAreaMap[custKey] = normArea
			}
		}
		for _, oi := range ord.Items {
			normArea := normalizer.NormalizeArea(oi.Area)
			if normArea != "" && ord.Customer != "" {
				custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
				if _, exists := customerAreaMap[custKey]; !exists {
					customerAreaMap[custKey] = normArea
				}
			}
		}
	}
	for _, it := range items {
		normArea := normalizer.NormalizeArea(it.Area)
		if normArea != "" && it.Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(it.Customer))
			if _, exists := customerAreaMap[custKey]; !exists {
				customerAreaMap[custKey] = normArea
			}
		}
	}

	// Ensure all orders have resolved area if known
	for i := range orders {
		if normalizer.NormalizeArea(orders[i].Area) == "" && orders[i].Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(orders[i].Customer))
			if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
				orders[i].Area = knownArea
				for j := range orders[i].Items {
					if orders[i].Items[j].Area == "" {
						orders[i].Items[j].Area = orders[i].Area
					}
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

	// Ensure all items have resolved area if known
	for i := range items {
		if normalizer.NormalizeArea(items[i].Area) == "" && items[i].Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(items[i].Customer))
			if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
				items[i].Area = knownArea
			}
		}
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
			if ord.Customer == it.Customer && ord.Tanggal.Equal(it.Tanggal) {
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
		cleanArea := normalizer.NormalizeArea(ord.Area)
		if cleanArea == "" && ord.Customer != "" {
			custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
			if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
				cleanArea = knownArea
			}
		}
		tanggalStr := ""
		if !ord.Tanggal.IsZero() {
			tanggalStr = ord.Tanggal.UTC().Format("2006-01-02")
		}
		if _, err := orderStmt.ExecContext(ctx, ord.ID, ord.OrderNumber, ord.EcatalogNumber, tanggalStr, ord.Customer, cleanArea, total, now); err != nil {
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

	deliveryStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO deliveries (item_id, delivery_date, shipped_quantity, shipment_index)
		VALUES (?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare delivery statement: %w", err)
	}
	defer deliveryStmt.Close()

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
			cleanArea := normalizer.NormalizeArea(it.Area)
			if cleanArea == "" {
				if ord, ok := orderByID[ordID]; ok {
					cleanArea = normalizer.NormalizeArea(ord.Area)
				}
			}
			if cleanArea == "" && it.Customer != "" {
				custKey := strings.ToLower(strings.TrimSpace(it.Customer))
				if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
					cleanArea = knownArea
				}
			}
			tanggalStr := ""
			if !it.Tanggal.IsZero() {
				tanggalStr = it.Tanggal.UTC().Format("2006-01-02")
			}
			res, err := itemStmt.ExecContext(ctx,
				it.RowIndex, ordID, orderNum, ecatNum, tanggalStr, it.Customer, cleanArea,
				it.NamaBarang, it.Jumlah, it.Satuan, it.TanggalPengiriman,
				it.LeadTimePengiriman, it.JumlahTerkirim, it.BelumTerkirim,
				it.StatusOrder, it.StatusBarang, it.Keterangan, it.Catatan,
			)
			if err != nil {
				return fmt.Errorf("failed to insert item (row %d): %w", it.RowIndex, err)
			}
			itemID, err := res.LastInsertId()
			if err != nil {
				return fmt.Errorf("failed to get item insert id (row %d): %w", it.RowIndex, err)
			}
			delEntries := normalizer.ParseDeliveryEntries(it.TanggalPengiriman)
			for dIdx, dEntry := range delEntries {
				if _, err := deliveryStmt.ExecContext(ctx, itemID, dEntry.Date, dEntry.Quantity, dIdx); err != nil {
					return fmt.Errorf("failed to insert delivery (item %d, entry %d): %w", itemID, dIdx, err)
				}
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
				cleanArea := normalizer.NormalizeArea(oi.Area)
				if cleanArea == "" {
					cleanArea = normalizer.NormalizeArea(ord.Area)
				}
				if cleanArea == "" && ord.Customer != "" {
					custKey := strings.ToLower(strings.TrimSpace(ord.Customer))
					if knownArea, ok := customerAreaMap[custKey]; ok && knownArea != "" {
						cleanArea = knownArea
					}
				}
				tanggalStr := ""
				if !ord.Tanggal.IsZero() {
					tanggalStr = ord.Tanggal.UTC().Format("2006-01-02")
				}
				res, err := itemStmt.ExecContext(ctx,
					oi.RowIndex, ord.ID, orderNum, ecatNum, tanggalStr, ord.Customer, cleanArea,
					oi.NamaBarang, oi.Jumlah, oi.Satuan, oi.TanggalPengiriman,
					oi.LeadTimePengiriman, oi.JumlahTerkirim, oi.BelumTerkirim,
					oi.StatusOrder, oi.StatusBarang, oi.Keterangan, oi.Catatan,
				)
				if err != nil {
					return fmt.Errorf("failed to insert order item (order %s, row %d): %w", ord.ID, oi.RowIndex, err)
				}
				itemID, err := res.LastInsertId()
				if err != nil {
					return fmt.Errorf("failed to get order item insert id (order %s, row %d): %w", ord.ID, oi.RowIndex, err)
				}
				delEntries := normalizer.ParseDeliveryEntries(oi.TanggalPengiriman)
				for dIdx, dEntry := range delEntries {
					if _, err := deliveryStmt.ExecContext(ctx, itemID, dEntry.Date, dEntry.Quantity, dIdx); err != nil {
						return fmt.Errorf("failed to insert delivery (item %d, entry %d): %w", itemID, dIdx, err)
					}
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
func (s *Storage) RecordSync(ctx context.Context, status string, itemsCount, ordersCount int, errMsg string, durationMs int64) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sync_history (synced_at, status, items_count, orders_count, error_message, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?)
	`, now, status, itemsCount, ordersCount, errMsg, durationMs)
	if err != nil {
		return fmt.Errorf("failed to record sync: %w", err)
	}
	return nil
}

// UpdateLastSyncDuration updates the duration of the most recent sync record.
func (s *Storage) UpdateLastSyncDuration(ctx context.Context, durationMs int64) error {
	_, err := s.db.ExecContext(ctx, "UPDATE sync_history SET duration_ms = ? WHERE id = (SELECT MAX(id) FROM sync_history)", durationMs)
	if err != nil {
		return fmt.Errorf("failed to update last sync duration: %w", err)
	}
	return nil
}

// GetCustomerAliases returns a map of lowercase alias (and lowercase canonical) to CustomerAlias.
func (s *Storage) GetCustomerAliases(ctx context.Context) (map[string]model.CustomerAlias, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT LOWER(alias), canonical, COALESCE(area, '') FROM customer_aliases")
	if err != nil {
		return nil, fmt.Errorf("failed to query customer aliases: %w", err)
	}
	defer rows.Close()

	aliases := make(map[string]model.CustomerAlias)
	for rows.Next() {
		var a, c, area string
		if err := rows.Scan(&a, &c, &area); err != nil {
			return nil, fmt.Errorf("failed to scan customer alias: %w", err)
		}
		cleanArea := strings.TrimSpace(area)
		if norm := normalizer.NormalizeArea(cleanArea); norm != "" {
			cleanArea = norm
		}
		aliases[a] = model.CustomerAlias{
			Alias:     a,
			Canonical: c,
			Area:      cleanArea,
		}
		cLower := strings.ToLower(strings.TrimSpace(c))
		if _, exists := aliases[cLower]; !exists && cleanArea != "" {
			aliases[cLower] = model.CustomerAlias{
				Canonical: c,
				Area:      cleanArea,
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading customer alias rows: %w", err)
	}
	return aliases, nil
}

// GetCustomerAliasesGrouped returns customer aliases grouped by canonical name, ordered by canonical then alias.
func (s *Storage) GetCustomerAliasesGrouped(ctx context.Context) ([]CustomerAliasGroup, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT alias, canonical, COALESCE(area, '') FROM customer_aliases ORDER BY canonical COLLATE NOCASE, alias COLLATE NOCASE")
	if err != nil {
		return nil, fmt.Errorf("failed to query grouped customer aliases: %w", err)
	}
	defer rows.Close()

	groupsMap := make(map[string][]string)
	areaMap := make(map[string]string)
	var canonicalOrder []string

	for rows.Next() {
		var alias, canonical, area string
		if err := rows.Scan(&alias, &canonical, &area); err != nil {
			return nil, fmt.Errorf("failed to scan customer alias: %w", err)
		}
		if _, exists := groupsMap[canonical]; !exists {
			canonicalOrder = append(canonicalOrder, canonical)
		}
		groupsMap[canonical] = append(groupsMap[canonical], alias)
		if area != "" && areaMap[canonical] == "" {
			areaMap[canonical] = area
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading grouped customer alias rows: %w", err)
	}

	result := make([]CustomerAliasGroup, 0, len(canonicalOrder))
	for _, c := range canonicalOrder {
		result = append(result, CustomerAliasGroup{
			Canonical: c,
			Area:      areaMap[c],
			Aliases:   groupsMap[c],
		})
	}
	return result, nil
}

// ImportCustomerAliasesResult contains counts and non-fatal errors from importing customer aliases.
type ImportCustomerAliasesResult struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors,omitempty"`
}

// GetCustomerAliasesFlat returns all customer alias mappings ordered by canonical and alias.
func (s *Storage) GetCustomerAliasesFlat(ctx context.Context) ([]model.CustomerAlias, error) {
	query := "SELECT alias, canonical, COALESCE(area, '') FROM customer_aliases ORDER BY canonical COLLATE NOCASE, alias COLLATE NOCASE"
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query customer aliases: %w", err)
	}
	defer rows.Close()

	var result []model.CustomerAlias
	for rows.Next() {
		var a model.CustomerAlias
		if err := rows.Scan(&a.Alias, &a.Canonical, &a.Area); err != nil {
			return nil, fmt.Errorf("failed to scan customer alias: %w", err)
		}
		result = append(result, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read customer aliases: %w", err)
	}
	return result, nil
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// DumpCustomerAliasesSQL generates a transactional raw SQL dump of all customer aliases.
func (s *Storage) DumpCustomerAliasesSQL(ctx context.Context) (string, error) {
	aliases, err := s.GetCustomerAliasesFlat(ctx)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("-- customer_aliases export ")
	sb.WriteString(time.Now().UTC().Format(time.RFC3339))
	sb.WriteString("\n-- generated by warehouse-parser\n")
	sb.WriteString("BEGIN TRANSACTION;\n")
	sb.WriteString("CREATE TABLE IF NOT EXISTS customer_aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, alias TEXT NOT NULL UNIQUE COLLATE NOCASE, canonical TEXT NOT NULL, area TEXT NOT NULL DEFAULT '');\n")
	sb.WriteString("CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias ON customer_aliases(alias);\n")

	for _, a := range aliases {
		sb.WriteString("INSERT INTO customer_aliases (alias, canonical, area) VALUES ('")
		sb.WriteString(escapeSQLString(a.Alias))
		sb.WriteString("', '")
		sb.WriteString(escapeSQLString(a.Canonical))
		sb.WriteString("', '")
		sb.WriteString(escapeSQLString(a.Area))
		sb.WriteString("') ON CONFLICT(alias) DO UPDATE SET canonical=excluded.canonical, area=excluded.area;\n")
	}

	sb.WriteString("COMMIT;\n")
	return sb.String(), nil
}

func applyCustomerAliasTx(ctx context.Context, tx *sql.Tx, trimmedAlias, trimmedCanonical, trimmedArea string) error {
	query := `
		INSERT INTO customer_aliases (alias, canonical, area)
		VALUES (?, ?, ?)
		ON CONFLICT(alias) DO UPDATE SET canonical = excluded.canonical, area = excluded.area
	`
	if _, err := tx.ExecContext(ctx, query, trimmedAlias, trimmedCanonical, trimmedArea); err != nil {
		return fmt.Errorf("failed to set customer alias: %w", err)
	}

	canonicalArea := ""
	if trimmedArea == "" {
		for _, table := range []string{"orders", "items"} {
			query := `SELECT COALESCE(MAX(NULLIF(TRIM(area), '')), '') FROM ` + table + ` WHERE customer = ? COLLATE BINARY`
			if err := tx.QueryRowContext(ctx, query, trimmedCanonical).Scan(&canonicalArea); err != nil {
				return fmt.Errorf("failed to find canonical customer area in %s: %w", table, err)
			}
			if canonicalArea != "" {
				break
			}
		}
	}
	for _, table := range []string{"orders", "items"} {
		query := `UPDATE ` + table + ` SET customer = ?, area = CASE WHEN ? != '' THEN ? WHEN TRIM(COALESCE(area, '')) = '' THEN ? ELSE area END WHERE customer = ? COLLATE NOCASE`
		if _, err := tx.ExecContext(ctx, query, trimmedCanonical, trimmedArea, trimmedArea, canonicalArea, trimmedAlias); err != nil {
			return fmt.Errorf("failed to canonicalize customer alias in %s: %w", table, err)
		}
	}
	return nil
}

// SetCustomerAlias creates or updates an alias mapping and canonicalizes existing rows.
func (s *Storage) SetCustomerAlias(ctx context.Context, alias, canonical, area string) error {
	trimmedAlias := strings.TrimSpace(alias)
	trimmedCanonical := strings.TrimSpace(canonical)
	trimmedArea := strings.TrimSpace(area)
	if norm := normalizer.NormalizeArea(trimmedArea); norm != "" {
		trimmedArea = norm
	}
	if trimmedAlias == "" || trimmedCanonical == "" {
		return fmt.Errorf("alias and canonical cannot be empty")
	}
	if trimmedAlias == trimmedCanonical {
		return fmt.Errorf("alias cannot be equal to canonical name")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin customer alias transaction: %w", err)
	}
	defer tx.Rollback()

	if err := applyCustomerAliasTx(ctx, tx, trimmedAlias, trimmedCanonical, trimmedArea); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit customer alias transaction: %w", err)
	}
	return nil
}

// ImportCustomerAliases imports a list of customer aliases using merge or replace mode.
func (s *Storage) ImportCustomerAliases(ctx context.Context, aliases []model.CustomerAlias, mode string) (ImportCustomerAliasesResult, error) {
	var res ImportCustomerAliasesResult
	normMode := strings.ToLower(strings.TrimSpace(mode))
	if normMode != "merge" && normMode != "replace" {
		return res, fmt.Errorf("invalid import mode %q: must be merge or replace", mode)
	}

	// Validate and dedup (case-insensitive key, last-wins)
	deduped := make(map[string]model.CustomerAlias)
	var order []string

	for _, a := range aliases {
		trimmedAlias := strings.TrimSpace(a.Alias)
		trimmedCanonical := strings.TrimSpace(a.Canonical)
		trimmedArea := strings.TrimSpace(a.Area)
		if norm := normalizer.NormalizeArea(trimmedArea); norm != "" {
			trimmedArea = norm
		}

		if trimmedAlias == "" || trimmedCanonical == "" {
			res.Skipped++
			res.Errors = append(res.Errors, fmt.Sprintf("skipped alias %q: alias and canonical cannot be empty", a.Alias))
			continue
		}
		if trimmedAlias == trimmedCanonical {
			res.Skipped++
			res.Errors = append(res.Errors, fmt.Sprintf("skipped alias %q: alias cannot be equal to canonical name", a.Alias))
			continue
		}

		key := strings.ToLower(trimmedAlias)
		if _, exists := deduped[key]; !exists {
			order = append(order, key)
		}
		deduped[key] = model.CustomerAlias{
			Alias:     trimmedAlias,
			Canonical: trimmedCanonical,
			Area:      trimmedArea,
		}
	}

	if len(order) == 0 {
		return res, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return res, fmt.Errorf("failed to begin customer alias import transaction: %w", err)
	}
	defer tx.Rollback()

	if normMode == "replace" {
		if _, err := tx.ExecContext(ctx, "DELETE FROM customer_aliases"); err != nil {
			return res, fmt.Errorf("failed to clear customer aliases for replace import: %w", err)
		}
	}

	for _, key := range order {
		item := deduped[key]
		if err := applyCustomerAliasTx(ctx, tx, item.Alias, item.Canonical, item.Area); err != nil {
			return res, err
		}
		res.Imported++
	}

	if err := tx.Commit(); err != nil {
		return res, fmt.Errorf("failed to commit customer alias import transaction: %w", err)
	}

	return res, nil
}

var (
	sqlInsertStmtRegex       = regexp.MustCompile(`(?is)INSERT\s+INTO\s+customer_aliases\s*(?:\([^)]*\))?\s*VALUES\s*(.+?)(?:ON\s+CONFLICT|;|$)`)
	sqlRowValuesRegex        = regexp.MustCompile(`\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'(?:\s*,\s*'((?:''|[^'])*)')?\s*\)`)
	sqlInsertDirectRegex     = regexp.MustCompile(`(?i)INSERT\s+INTO\s+customer_aliases\s*(?:\([^)]*\))?\s*VALUES\s*\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'(?:\s*,\s*'((?:''|[^'])*)')?\s*\)`)
	sqlHasInsertKeywordRegex = regexp.MustCompile(`(?i)\bINSERT\b`)
)

// ImportCustomerAliasesSQL parses raw SQL containing customer_aliases INSERT statements and executes them with merge/replace semantics.
// Non-customer_aliases statements (e.g. DROP, DELETE, CREATE beyond header, other tables) are ignored for security; SQL is parsed, never executed verbatim.
func (s *Storage) ImportCustomerAliasesSQL(ctx context.Context, rawSQL string, mode string) (ImportCustomerAliasesResult, error) {
	normMode := strings.ToLower(strings.TrimSpace(mode))
	if normMode != "merge" && normMode != "replace" {
		return ImportCustomerAliasesResult{}, fmt.Errorf("invalid import mode %q: must be merge or replace", mode)
	}

	trimmed := strings.TrimSpace(rawSQL)
	if trimmed == "" {
		return ImportCustomerAliasesResult{}, nil
	}

	var aliases []model.CustomerAlias

	// Try extracting via statement blocks first (handles multi-row VALUES as well)
	stmtMatches := sqlInsertStmtRegex.FindAllStringSubmatch(trimmed, -1)
	for _, sm := range stmtMatches {
		valuesClause := sm[1]
		rowMatches := sqlRowValuesRegex.FindAllStringSubmatch(valuesClause, -1)
		for _, rm := range rowMatches {
			alias := strings.ReplaceAll(rm[1], "''", "'")
			canonical := strings.ReplaceAll(rm[2], "''", "'")
			area := ""
			if len(rm) > 3 {
				area = strings.ReplaceAll(rm[3], "''", "'")
			}
			aliases = append(aliases, model.CustomerAlias{
				Alias:     alias,
				Canonical: canonical,
				Area:      area,
			})
		}
	}

	// Fallback to direct regex if statement regex yielded nothing
	if len(aliases) == 0 {
		directMatches := sqlInsertDirectRegex.FindAllStringSubmatch(trimmed, -1)
		for _, dm := range directMatches {
			alias := strings.ReplaceAll(dm[1], "''", "'")
			canonical := strings.ReplaceAll(dm[2], "''", "'")
			area := ""
			if len(dm) > 3 {
				area = strings.ReplaceAll(dm[3], "''", "'")
			}
			aliases = append(aliases, model.CustomerAlias{
				Alias:     alias,
				Canonical: canonical,
				Area:      area,
			})
		}
	}

	if len(aliases) == 0 {
		if sqlHasInsertKeywordRegex.MatchString(trimmed) {
			return ImportCustomerAliasesResult{
				Imported: 0,
				Skipped:  0,
				Errors:   []string{"no valid INSERT INTO customer_aliases statements found"},
			}, nil
		}
		return ImportCustomerAliasesResult{Imported: 0, Skipped: 0}, nil
	}

	return s.ImportCustomerAliases(ctx, aliases, normMode)
}


// DeleteCustomerAlias deletes a customer alias mapping case-insensitively.
func (s *Storage) DeleteCustomerAlias(ctx context.Context, alias string) error {
	trimmedAlias := strings.TrimSpace(alias)
	if trimmedAlias == "" {
		return fmt.Errorf("alias cannot be empty")
	}

	query := `DELETE FROM customer_aliases WHERE alias = ? COLLATE NOCASE`
	if _, err := s.db.ExecContext(ctx, query, trimmedAlias); err != nil {
		return fmt.Errorf("failed to delete customer alias: %w", err)
	}
	return nil
}

// customerMatchPatterns returns the search pattern for the query plus all related
// canonical and alias patterns where alias or canonical matches the query.
func (s *Storage) customerMatchPatterns(ctx context.Context, query string) ([]string, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return nil, nil
	}

	pattern := "%" + trimmed + "%"
	seen := make(map[string]struct{})
	var patterns []string

	addPattern := func(p string) {
		pLower := strings.ToLower(p)
		if _, ok := seen[pLower]; !ok {
			seen[pLower] = struct{}{}
			patterns = append(patterns, p)
		}
	}

	addPattern(pattern)

	rows, err := s.db.QueryContext(ctx, `
		SELECT alias, canonical FROM customer_aliases
		WHERE alias LIKE ? OR canonical LIKE ?
	`, pattern, pattern)
	if err != nil {
		return patterns, nil // fallback to base pattern if query fails
	}
	defer rows.Close()

	for rows.Next() {
		var a, c string
		if err := rows.Scan(&a, &c); err == nil {
			if c != "" {
				addPattern("%" + c + "%")
			}
			if a != "" {
				addPattern("%" + a + "%")
			}
		}
	}

	return patterns, nil
}

func normalizedSortDirection(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "asc") {
		return "ASC"
	}
	return "DESC"
}

const (
	orderStatusRankSubquery = `COALESCE((
		SELECT CASE UPPER(TRIM(status_order))
			WHEN 'BELUM SELESAI' THEN 0
			WHEN 'PROSES' THEN 1
			WHEN 'PENDING' THEN 2
			ELSE 3
		END
		FROM items
		WHERE items.order_id = orders.id
		ORDER BY
			CASE UPPER(TRIM(status_order))
				WHEN 'BELUM SELESAI' THEN 0
				WHEN 'PROSES' THEN 1
				WHEN 'PENDING' THEN 2
				ELSE 3
			END ASC,
			LOWER(status_order) ASC
		LIMIT 1
	), 4)`

	orderStatusNameSubquery = `COALESCE((
		SELECT LOWER(status_order)
		FROM items
		WHERE items.order_id = orders.id
		ORDER BY
			CASE UPPER(TRIM(status_order))
				WHEN 'BELUM SELESAI' THEN 0
				WHEN 'PROSES' THEN 1
				WHEN 'PENDING' THEN 2
				ELSE 3
			END ASC,
			LOWER(status_order) ASC
		LIMIT 1
	), '')`

	itemStatusRankExpr = `(CASE UPPER(TRIM(status_order))
		WHEN 'BELUM SELESAI' THEN 0
		WHEN 'PROSES' THEN 1
		WHEN 'PENDING' THEN 2
		ELSE 3
	END)`
)

func orderSortSQL(sortField, direction string) string {
	dir := normalizedSortDirection(direction)
	cleanField := strings.ToLower(strings.TrimSpace(sortField))
	switch cleanField {
	case "", "date", "tanggal":
		return fmt.Sprintf("tanggal %s, %s ASC, %s ASC, orders.id ASC", dir, orderStatusRankSubquery, orderStatusNameSubquery)
	case "status":
		return fmt.Sprintf("%s %s, %s %s, tanggal DESC, orders.id ASC", orderStatusRankSubquery, dir, orderStatusNameSubquery, dir)
	case "id":
		return fmt.Sprintf("orders.id %s, tanggal DESC", dir)
	case "order_number", "ecatalog_number":
		return fmt.Sprintf("COALESCE(NULLIF(order_number, ''), ecatalog_number, '') COLLATE NOCASE %s, tanggal DESC, orders.id ASC", dir)
	case "customer":
		return fmt.Sprintf("customer COLLATE NOCASE %s, tanggal DESC, orders.id ASC", dir)
	case "area":
		return fmt.Sprintf("area COLLATE NOCASE %s, tanggal DESC, orders.id ASC", dir)
	case "items", "total_items":
		return fmt.Sprintf("CAST(COALESCE(total_items, (SELECT COUNT(*) FROM items WHERE items.order_id = orders.id)) AS INTEGER) %s, tanggal DESC, orders.id ASC", dir)
	default:
		return fmt.Sprintf("tanggal DESC, %s ASC, %s ASC, orders.id ASC", orderStatusRankSubquery, orderStatusNameSubquery)
	}
}

func itemSortSQL(sortField, direction string) string {
	dir := normalizedSortDirection(direction)
	cleanField := strings.ToLower(strings.TrimSpace(sortField))
	switch cleanField {
	case "", "date", "tanggal":
		return fmt.Sprintf("tanggal %s, %s ASC, LOWER(status_order) ASC, id ASC", dir, itemStatusRankExpr)
	case "status", "status_order":
		return fmt.Sprintf("%s %s, LOWER(status_order) %s, tanggal DESC, id ASC", itemStatusRankExpr, dir, dir)
	case "row_index":
		return fmt.Sprintf("row_index %s, tanggal DESC, id ASC", dir)
	case "order_number", "ecatalog_number":
		return fmt.Sprintf("COALESCE(NULLIF(order_number, ''), ecatalog_number, '') COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "customer":
		return fmt.Sprintf("customer COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "area":
		return fmt.Sprintf("area COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "nama_barang":
		return fmt.Sprintf("nama_barang COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "jumlah":
		return fmt.Sprintf("CAST(jumlah AS REAL) %s, tanggal DESC, id ASC", dir)
	case "status_barang":
		return fmt.Sprintf("status_barang COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "tanggal_pengiriman":
		return fmt.Sprintf("tanggal_pengiriman COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	case "catatan", "notes":
		return fmt.Sprintf("catatan COLLATE NOCASE %s, tanggal DESC, id ASC", dir)
	default:
		return fmt.Sprintf("tanggal DESC, %s ASC, LOWER(status_order) ASC, id ASC", itemStatusRankExpr)
	}
}

// GetOrders retrieves orders matching the filter criteria with pagination support.
// Returns matched orders slice, total count before pagination, and any error.
func (s *Storage) GetOrders(ctx context.Context, filter OrderFilter) ([]model.Order, int, error) {
	var conditions []string
	var args []any

	if filter.Customer != "" {
		patterns, err := s.customerMatchPatterns(ctx, filter.Customer)
		if err != nil {
			return nil, 0, err
		}
		custConds := make([]string, len(patterns))
		for i, p := range patterns {
			custConds[i] = "customer LIKE ?"
			args = append(args, p)
		}
		conditions = append(conditions, "("+strings.Join(custConds, " OR ")+")")
	}

	date := filter.Date
	if date == "" {
		date = filter.Tanggal
	}
	if date != "" {
		rawDate := strings.TrimSpace(date)
		parsed := normalizer.ParseDate(rawDate)
		if !parsed.IsZero() {
			conditions = append(conditions, "tanggal = ?")
			args = append(args, parsed.Format("2006-01-02"))
		} else {
			conditions = append(conditions, "1 = 0")
		}
	}

	if filter.Area != "" {
		trimmedArea := strings.TrimSpace(filter.Area)
		if norm := normalizer.NormalizeArea(trimmedArea); norm != "" {
			trimmedArea = norm
		}
		if trimmedArea != "" && trimmedArea != "-" {
			conditions = append(conditions, "LOWER(area) LIKE ?")
			args = append(args, "%"+strings.ToLower(trimmedArea)+"%")
		}
	}

	orderNum := filter.OrderNumber
	if orderNum == "" {
		orderNum = filter.EcatalogNumber
	}
	if orderNum != "" {
		conditions = append(conditions, "order_number = ?")
		args = append(args, orderNum)
	}
	if filter.Status != "" {
		conditions = append(conditions, "id IN (SELECT DISTINCT order_id FROM items WHERE UPPER(TRIM(status_order)) = UPPER(TRIM(?)))")
		args = append(args, filter.Status)
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

	selectQuery := "SELECT id, order_number, ecatalog_number, tanggal, customer, area FROM orders" + whereClause + " ORDER BY " + orderSortSQL(filter.Sort, filter.Order)
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
		var tanggalVal any
		if err := rows.Scan(&ord.ID, &orderNumber, &ecatalogNumber, &tanggalVal, &ord.Customer, &ord.Area); err != nil {
			return nil, 0, fmt.Errorf("failed to scan order row: %w", err)
		}
		ord.OrderNumber = orderNumber.String
		ord.EcatalogNumber = ecatalogNumber.String
		ord.Tanggal = parseStoredDate(tanggalVal)
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
			       status_barang, keterangan, catatan, area
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
				var itemOrderNum, itemEcatNum, itemArea sql.NullString
				if err := itemRows.Scan(
					&orderID, &oi.RowIndex, &itemOrderNum, &itemEcatNum, &oi.NamaBarang, &oi.Jumlah, &oi.Satuan,
					&oi.TanggalPengiriman, &oi.LeadTimePengiriman, &oi.JumlahTerkirim,
					&oi.BelumTerkirim, &oi.StatusOrder, &oi.StatusBarang,
					&oi.Keterangan, &oi.Catatan, &itemArea,
				); err == nil {
					oi.OrderNumber = itemOrderNum.String
					oi.EcatalogNumber = itemEcatNum.String
					oi.Area = itemArea.String
					orderItemMap[orderID] = append(orderItemMap[orderID], oi)
				}
			}
			for i := range orders {
				if its, ok := orderItemMap[orders[i].ID]; ok {
					for j := range its {
						if its[j].Area == "" && orders[i].Area != "" {
							its[j].Area = orders[i].Area
						}
					}
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
	var tanggalVal any
	err := s.db.QueryRowContext(ctx, `
		SELECT id, order_number, ecatalog_number, tanggal, customer, area
		FROM orders
		WHERE id = ?
	`, id).Scan(&ord.ID, &orderNumber, &ecatalogNumber, &tanggalVal, &ord.Customer, &ord.Area)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("order %q not found: %w", id, sql.ErrNoRows)
		}
		return nil, fmt.Errorf("failed to query order %q: %w", id, err)
	}
	ord.OrderNumber = orderNumber.String
	ord.EcatalogNumber = ecatalogNumber.String
	ord.Tanggal = parseStoredDate(tanggalVal)

	rows, err := s.db.QueryContext(ctx, `
		SELECT row_index, order_number, ecatalog_number, nama_barang, jumlah, satuan, tanggal_pengiriman,
		       lead_time_pengiriman, jumlah_terkirim, belum_terkirim, status_order,
		       status_barang, keterangan, catatan, area
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
		var itemOrderNum, itemEcatNum, itemArea sql.NullString
		if err := rows.Scan(
			&it.RowIndex, &itemOrderNum, &itemEcatNum, &it.NamaBarang, &it.Jumlah, &it.Satuan,
			&it.TanggalPengiriman, &it.LeadTimePengiriman, &it.JumlahTerkirim,
			&it.BelumTerkirim, &it.StatusOrder, &it.StatusBarang,
			&it.Keterangan, &it.Catatan, &itemArea,
		); err != nil {
			return nil, fmt.Errorf("failed to scan item for order %q: %w", id, err)
		}
		it.OrderNumber = itemOrderNum.String
		it.EcatalogNumber = itemEcatNum.String
		it.Area = itemArea.String
		if it.Area == "" && ord.Area != "" {
			it.Area = ord.Area
		}
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
		patterns, err := s.customerMatchPatterns(ctx, filter.Customer)
		if err != nil {
			return nil, 0, err
		}
		custConds := make([]string, len(patterns))
		for i, p := range patterns {
			custConds[i] = "customer LIKE ?"
			args = append(args, p)
		}
		conditions = append(conditions, "("+strings.Join(custConds, " OR ")+")")
	}
	if filter.NamaBarang != "" {
		conditions = append(conditions, "nama_barang LIKE ?")
		args = append(args, "%"+filter.NamaBarang+"%")
	}
	if filter.StatusOrder != "" {
		conditions = append(conditions, "UPPER(TRIM(status_order)) = UPPER(TRIM(?))")
		args = append(args, filter.StatusOrder)
	}
	if filter.StatusBarangOther || strings.EqualFold(filter.StatusBarang, "other") {
		conditions = append(conditions, "TRIM(COALESCE(status_barang, '')) != '' AND UPPER(TRIM(status_barang)) NOT IN ('PROSES ORDER', 'STOK GUDANG', 'STOK KOSONG', 'DELIVERY VENDOR', 'DONE')")
	} else if filter.StatusBarang != "" && !strings.EqualFold(filter.StatusBarang, "all") {
		conditions = append(conditions, "UPPER(TRIM(status_barang)) = UPPER(TRIM(?))")
		args = append(args, strings.TrimSpace(filter.StatusBarang))
	}

	date := filter.Date
	if date == "" {
		date = filter.Tanggal
	}
	if date != "" {
		rawDate := strings.TrimSpace(date)
		parsed := normalizer.ParseDate(rawDate)
		if !parsed.IsZero() {
			conditions = append(conditions, "tanggal = ?")
			args = append(args, parsed.Format("2006-01-02"))
		} else {
			conditions = append(conditions, "1 = 0")
		}
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
	` + whereClause + " ORDER BY " + itemSortSQL(filter.Sort, filter.Order)

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
		var tanggalVal any
		if err := rows.Scan(
			&it.RowIndex, &itemOrderNum, &itemEcatNum, &tanggalVal, &it.Customer, &it.Area, &it.NamaBarang,
			&it.Jumlah, &it.Satuan, &it.TanggalPengiriman, &it.LeadTimePengiriman,
			&it.JumlahTerkirim, &it.BelumTerkirim, &it.StatusOrder, &it.StatusBarang,
			&it.Keterangan, &it.Catatan,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan item row: %w", err)
		}
		it.OrderNumber = itemOrderNum.String
		it.EcatalogNumber = itemEcatNum.String
		it.Tanggal = parseStoredDate(tanggalVal)
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading item rows: %w", err)
	}

	return items, total, nil
}

// GetDeliveries retrieves delivery shipment rows joined with their source item matching filters with pagination.
func (s *Storage) GetDeliveries(ctx context.Context, filter DeliveryFilter) ([]DeliveryItem, int, error) {
	var conditions []string
	var args []any

	if filter.Customer != "" {
		patterns, err := s.customerMatchPatterns(ctx, filter.Customer)
		if err != nil {
			return nil, 0, err
		}
		custConds := make([]string, len(patterns))
		for i, p := range patterns {
			custConds[i] = "i.customer LIKE ?"
			args = append(args, p)
		}
		conditions = append(conditions, "("+strings.Join(custConds, " OR ")+")")
	}
	if filter.NamaBarang != "" {
		conditions = append(conditions, "i.nama_barang LIKE ?")
		args = append(args, "%"+filter.NamaBarang+"%")
	}
	if filter.StatusOrder != "" {
		conditions = append(conditions, "i.status_order LIKE ?")
		args = append(args, "%"+filter.StatusOrder+"%")
	}

	date := filter.Date
	if date == "" {
		date = filter.Tanggal
	}
	if date != "" {
		dateConds := []string{"d.delivery_date LIKE ?", "i.tanggal LIKE ?"}
		args = append(args, "%"+date+"%", "%"+date+"%")
		if parsed := model.ParseDate(date); !parsed.IsZero() {
			isoDate := parsed.Format("2006-01-02")
			if isoDate != date {
				dateConds = append(dateConds, "d.delivery_date LIKE ?", "i.tanggal LIKE ?")
				args = append(args, "%"+isoDate+"%", "%"+isoDate+"%")
			}
		}
		conditions = append(conditions, "("+strings.Join(dateConds, " OR ")+")")
	}

	orderNum := filter.OrderNumber
	if orderNum == "" {
		orderNum = filter.EcatalogNumber
	}
	if orderNum != "" {
		conditions = append(conditions, "i.order_number = ?")
		args = append(args, orderNum)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := "SELECT COUNT(*) FROM deliveries d JOIN items i ON d.item_id = i.id" + whereClause
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count deliveries: %w", err)
	}
	if total == 0 {
		return []DeliveryItem{}, 0, nil
	}

	selectQuery := `
		SELECT d.delivery_date, d.shipped_quantity, d.shipment_index,
		       (SELECT COUNT(*) FROM deliveries d2 WHERE d2.item_id = i.id) as shipment_count,
		       COALESCE(i.row_index, 0), COALESCE(i.order_id, ''), COALESCE(i.order_number, ''), COALESCE(i.ecatalog_number, ''),
		       COALESCE(i.tanggal, ''), COALESCE(i.customer, ''), COALESCE(i.area, ''),
		       COALESCE(i.nama_barang, ''), COALESCE(i.jumlah, ''), COALESCE(i.satuan, ''),
		       COALESCE(i.tanggal_pengiriman, ''), COALESCE(i.lead_time_pengiriman, ''),
		       COALESCE(i.jumlah_terkirim, ''), COALESCE(i.belum_terkirim, ''),
		       COALESCE(i.status_order, ''), COALESCE(i.status_barang, ''),
		       COALESCE(i.keterangan, ''), COALESCE(i.catatan, '')
		FROM deliveries d
		JOIN items i ON d.item_id = i.id
	` + whereClause + ` ORDER BY CASE
		WHEN length(d.delivery_date) = 10 AND substr(d.delivery_date, 3, 1) = '/' AND substr(d.delivery_date, 6, 1) = '/'
		THEN substr(d.delivery_date, 7, 4) || '-' || substr(d.delivery_date, 4, 2) || '-' || substr(d.delivery_date, 1, 2)
		ELSE d.delivery_date
	END ASC, d.id ASC`

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
		return nil, 0, fmt.Errorf("failed to query deliveries: %w", err)
	}
	defer rows.Close()

	var deliveries []DeliveryItem
	for rows.Next() {
		var di DeliveryItem
		var ordID string
		var tanggalVal any
		if err := rows.Scan(
			&di.DeliveryDate, &di.ShippedQuantity, &di.ShipmentIndex, &di.ShipmentCount,
			&di.Item.RowIndex, &ordID, &di.Item.OrderNumber, &di.Item.EcatalogNumber, &tanggalVal, &di.Item.Customer, &di.Item.Area,
			&di.Item.NamaBarang, &di.Item.Jumlah, &di.Item.Satuan, &di.Item.TanggalPengiriman,
			&di.Item.LeadTimePengiriman, &di.Item.JumlahTerkirim, &di.Item.BelumTerkirim,
			&di.Item.StatusOrder, &di.Item.StatusBarang, &di.Item.Keterangan, &di.Item.Catatan,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan delivery row: %w", err)
		}
		di.Item.Tanggal = parseStoredDate(tanggalVal)
		deliveries = append(deliveries, di)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading delivery rows: %w", err)
	}

	return deliveries, total, nil
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
		SELECT id, synced_at, status, items_count, orders_count, error_message, COALESCE(duration_ms, 0)
		FROM sync_history
		ORDER BY id DESC
		LIMIT 1
	`)
	var rec SyncRecord
	var errMsg sql.NullString
	if err := row.Scan(&rec.ID, &rec.SyncedAt, &rec.Status, &rec.ItemsCount, &rec.OrdersCount, &errMsg, &rec.DurationMs); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query last sync: %w", err)
	}
	rec.ErrorMessage = errMsg.String
	return &rec, nil
}

// GetSyncHistory retrieves sync history records with pagination support.
func (s *Storage) GetSyncHistory(ctx context.Context, limit, offset int) ([]SyncRecord, int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sync_history").Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count sync history: %w", err)
	}
	if total == 0 {
		return []SyncRecord{}, 0, nil
	}

	query := "SELECT id, synced_at, status, items_count, orders_count, error_message, COALESCE(duration_ms, 0) FROM sync_history ORDER BY id DESC"
	var args []any
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
		if offset > 0 {
			query += " OFFSET ?"
			args = append(args, offset)
		}
	} else if offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		args = append(args, offset)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query sync history: %w", err)
	}
	defer rows.Close()

	var records []SyncRecord
	for rows.Next() {
		var rec SyncRecord
		var errMsg sql.NullString
		if err := rows.Scan(&rec.ID, &rec.SyncedAt, &rec.Status, &rec.ItemsCount, &rec.OrdersCount, &errMsg, &rec.DurationMs); err != nil {
			return nil, 0, fmt.Errorf("failed to scan sync record: %w", err)
		}
		rec.ErrorMessage = errMsg.String
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading sync history rows: %w", err)
	}
	if records == nil {
		records = []SyncRecord{}
	}
	return records, total, nil
}

// GetCustomers returns customer summaries with aggregated metrics and status counts.
func (s *Storage) GetCustomers(ctx context.Context, search, area string, limit, offset int) ([]CustomerSummary, int, error) {
	var conditions []string
	var args []any

	conditions = append(conditions, "o.customer != ''")
	if search != "" {
		patterns, err := s.customerMatchPatterns(ctx, search)
		if err != nil {
			return nil, 0, err
		}
		custConds := make([]string, len(patterns))
		for i, p := range patterns {
			custConds[i] = "o.customer LIKE ?"
			args = append(args, p)
		}
		conditions = append(conditions, "("+strings.Join(custConds, " OR ")+")")
	}
	if area != "" {
		trimmedArea := strings.TrimSpace(area)
		if norm := normalizer.NormalizeArea(trimmedArea); norm != "" {
			trimmedArea = norm
		}
		if trimmedArea != "" && trimmedArea != "-" {
			conditions = append(conditions, "LOWER(o.area) LIKE ?")
			args = append(args, "%"+strings.ToLower(trimmedArea)+"%")
		}
	}

	whereClause := " WHERE " + strings.Join(conditions, " AND ")

	countQuery := "SELECT COUNT(DISTINCT o.customer) FROM orders o" + whereClause
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count customers: %w", err)
	}
	if total == 0 {
		return []CustomerSummary{}, 0, nil
	}

	query := `
		SELECT o.customer, COALESCE(MAX(o.area), ''), COUNT(DISTINCT o.id) as total_orders,
		       COUNT(i.id) as total_items, COALESCE(MAX(o.tanggal), '') as last_order_date
		FROM orders o LEFT JOIN items i ON i.order_id = o.id
	` + whereClause + " GROUP BY o.customer ORDER BY total_orders DESC"

	queryArgs := append([]any{}, args...)
	if limit > 0 {
		query += " LIMIT ?"
		queryArgs = append(queryArgs, limit)
		if offset > 0 {
			query += " OFFSET ?"
			queryArgs = append(queryArgs, offset)
		}
	} else if offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		queryArgs = append(queryArgs, offset)
	}

	rows, err := s.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query customers: %w", err)
	}
	defer rows.Close()

	var customers []CustomerSummary
	var customerNames []string
	for rows.Next() {
		var cs CustomerSummary
		if err := rows.Scan(&cs.Name, &cs.Area, &cs.TotalOrders, &cs.TotalItems, &cs.LastOrderDate); err != nil {
			return nil, 0, fmt.Errorf("failed to scan customer summary: %w", err)
		}
		cs.StatusCounts = make(map[string]int)
		customers = append(customers, cs)
		customerNames = append(customerNames, cs.Name)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error reading customer rows: %w", err)
	}

	// Fetch status counts for these customers
	if len(customerNames) > 0 {
		placeholders := make([]string, len(customerNames))
		statusArgs := make([]any, len(customerNames))
		for idx, name := range customerNames {
			placeholders[idx] = "?"
			statusArgs[idx] = name
		}
		statusQuery := fmt.Sprintf(`
			SELECT customer, status_order, COUNT(*)
			FROM items
			WHERE customer IN (%s) AND status_order != ''
			GROUP BY customer, status_order
		`, strings.Join(placeholders, ","))

		sRows, err := s.db.QueryContext(ctx, statusQuery, statusArgs...)
		if err == nil {
			defer sRows.Close()
			statusMap := make(map[string]map[string]int)
			for sRows.Next() {
				var cust, st string
				var count int
				if err := sRows.Scan(&cust, &st, &count); err == nil {
					if statusMap[cust] == nil {
						statusMap[cust] = make(map[string]int)
					}
					statusMap[cust][st] = count
				}
			}
			for i := range customers {
				if sm, ok := statusMap[customers[i].Name]; ok {
					customers[i].StatusCounts = sm
				}
			}
		}
	}

	if customers == nil {
		customers = []CustomerSummary{}
	}
	return customers, total, nil
}

// GetAreas returns area summaries with aggregated metrics and status counts.
func (s *Storage) GetAreas(ctx context.Context) ([]AreaSummary, error) {
	query := `
		SELECT o.area, COUNT(DISTINCT o.id), COUNT(i.id), COUNT(DISTINCT o.customer)
		FROM orders o LEFT JOIN items i ON i.order_id = o.id
		WHERE o.area != ''
		GROUP BY o.area
		ORDER BY COUNT(DISTINCT o.id) DESC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query areas: %w", err)
	}
	defer rows.Close()

	var areas []AreaSummary
	for rows.Next() {
		var as AreaSummary
		if err := rows.Scan(&as.Name, &as.TotalOrders, &as.TotalItems, &as.UniqueCustomers); err != nil {
			return nil, fmt.Errorf("failed to scan area summary: %w", err)
		}
		as.StatusCounts = make(map[string]int)
		areas = append(areas, as)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading area rows: %w", err)
	}

	// Status counts per area
	sRows, err := s.db.QueryContext(ctx, `
		SELECT area, status_order, COUNT(*)
		FROM items
		WHERE area != '' AND status_order != ''
		GROUP BY area, status_order
	`)
	if err == nil {
		defer sRows.Close()
		areaStatus := make(map[string]map[string]int)
		for sRows.Next() {
			var a, st string
			var count int
			if err := sRows.Scan(&a, &st, &count); err == nil {
				if areaStatus[a] == nil {
					areaStatus[a] = make(map[string]int)
				}
				areaStatus[a][st] = count
			}
		}
		for i := range areas {
			if sm, ok := areaStatus[areas[i].Name]; ok {
				areas[i].StatusCounts = sm
			}
		}
	}

	if areas == nil {
		areas = []AreaSummary{}
	}
	return areas, nil
}

// SearchAll searches across orders, items, and customers.
func (s *Storage) SearchAll(ctx context.Context, query, searchType string, limit int) (*SearchResult, error) {
	if limit <= 0 {
		limit = 10
	}
	if searchType == "" {
		searchType = "all"
	}

	result := &SearchResult{
		Query: query,
		Orders: SearchOrders{
			Results: make([]SearchOrderResult, 0),
		},
		Items: SearchItems{
			Results: make([]SearchItemResult, 0),
		},
		Customers: SearchCustomers{
			Results: make([]SearchCustomerResult, 0),
		},
	}

	likePattern := "%" + query + "%"
	custPatterns, _ := s.customerMatchPatterns(ctx, query)
	if len(custPatterns) == 0 {
		custPatterns = []string{likePattern}
	}

	var custConds []string
	var custArgs []any
	for _, p := range custPatterns {
		custConds = append(custConds, "customer LIKE ?")
		custArgs = append(custArgs, p)
	}
	custClause := "(" + strings.Join(custConds, " OR ") + ")"

	// 1. Orders
	if searchType == "all" || searchType == "orders" {
		countQuery := fmt.Sprintf(`
			SELECT COUNT(*) FROM orders
			WHERE %s OR id IN (SELECT DISTINCT order_id FROM items WHERE nama_barang LIKE ?)
		`, custClause)
		countArgs := append(append([]any{}, custArgs...), likePattern)
		_ = s.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&result.Orders.Total)

		if result.Orders.Total > 0 {
			ordersQuery := fmt.Sprintf(`
				SELECT id, customer, tanggal FROM orders
				WHERE %s OR id IN (SELECT DISTINCT order_id FROM items WHERE nama_barang LIKE ?)
				ORDER BY id LIMIT ?
			`, custClause)
			queryArgs := append(append(append([]any{}, custArgs...), likePattern), limit)
			oRows, err := s.db.QueryContext(ctx, ordersQuery, queryArgs...)
			if err == nil {
				for oRows.Next() {
					var ord SearchOrderResult
					ord.MatchedItems = make([]string, 0)
					if err := oRows.Scan(&ord.ID, &ord.Customer, &ord.Tanggal); err == nil {
						result.Orders.Results = append(result.Orders.Results, ord)
					}
				}
				oRows.Close()

				for idx := range result.Orders.Results {
					ordID := result.Orders.Results[idx].ID
					iRows, iErr := s.db.QueryContext(ctx, `
						SELECT DISTINCT nama_barang FROM items
						WHERE order_id = ? AND nama_barang LIKE ? LIMIT 5
					`, ordID, likePattern)
					if iErr == nil {
						for iRows.Next() {
							var nb string
							if err := iRows.Scan(&nb); err == nil {
								result.Orders.Results[idx].MatchedItems = append(result.Orders.Results[idx].MatchedItems, nb)
							}
						}
						iRows.Close()
					}
				}
			}
		}
	}

	// 2. Items
	if searchType == "all" || searchType == "items" {
		countQuery := fmt.Sprintf(`
			SELECT COUNT(*) FROM items
			WHERE nama_barang LIKE ? OR %s
		`, custClause)
		countArgs := append([]any{likePattern}, custArgs...)
		_ = s.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&result.Items.Total)

		if result.Items.Total > 0 {
			itemsQuery := fmt.Sprintf(`
				SELECT row_index, customer, nama_barang, jumlah, status_order
				FROM items
				WHERE nama_barang LIKE ? OR %s
				ORDER BY row_index LIMIT ?
			`, custClause)
			queryArgs := append(append([]any{likePattern}, custArgs...), limit)
			iRows, err := s.db.QueryContext(ctx, itemsQuery, queryArgs...)
			if err == nil {
				defer iRows.Close()
				for iRows.Next() {
					var it SearchItemResult
					if err := iRows.Scan(&it.RowIndex, &it.Customer, &it.NamaBarang, &it.Jumlah, &it.StatusOrder); err == nil {
						result.Items.Results = append(result.Items.Results, it)
					}
				}
			}
		}
	}

	// 3. Customers
	if searchType == "all" || searchType == "customers" {
		countQuery := fmt.Sprintf(`
			SELECT COUNT(DISTINCT customer) FROM orders
			WHERE %s AND customer != ''
		`, custClause)
		_ = s.db.QueryRowContext(ctx, countQuery, custArgs...).Scan(&result.Customers.Total)

		if result.Customers.Total > 0 {
			cQuery := fmt.Sprintf(`
				SELECT customer, COALESCE(MAX(area), ''), COUNT(DISTINCT id)
				FROM orders
				WHERE %s AND customer != ''
				GROUP BY customer
				ORDER BY COUNT(DISTINCT id) DESC LIMIT ?
			`, custClause)
			queryArgs := append(append([]any{}, custArgs...), limit)
			cRows, err := s.db.QueryContext(ctx, cQuery, queryArgs...)
			if err == nil {
				defer cRows.Close()
				for cRows.Next() {
					var c SearchCustomerResult
					if err := cRows.Scan(&c.Name, &c.Area, &c.TotalOrders); err == nil {
						result.Customers.Results = append(result.Customers.Results, c)
					}
				}
			}
		}
	}

	return result, nil
}

// GetTableStats returns row counts for orders, items, and sync_history tables.
func (s *Storage) GetTableStats(ctx context.Context) (map[string]TableStat, error) {
	stats := make(map[string]TableStat)
	tables := []string{"orders", "items", "sync_history"}
	for _, tbl := range tables {
		var count int
		query := fmt.Sprintf("SELECT COUNT(*) FROM %s", tbl)
		if err := s.db.QueryRowContext(ctx, query).Scan(&count); err != nil {
			return nil, fmt.Errorf("failed to count %s: %w", tbl, err)
		}
		stats[tbl] = TableStat{RowCount: count}
	}
	return stats, nil
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
