package api

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/version"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"
)

// HealthResponse defines the health check response.
type HealthResponse struct {
	Status string `json:"status" example:"ok"`
}

// StatusResponse defines the worker status payload.
type StatusResponse struct {
	Status            string              `json:"status" example:"IDLE"`
	IsInsideWorkHours bool                `json:"is_inside_work_hours"`
	LastSync          *time.Time          `json:"last_sync,omitempty"`
	NextSync          *time.Time          `json:"next_sync,omitempty"`
	LastDurationMs    int64               `json:"last_duration_ms,omitempty"`
	Error             string              `json:"error,omitempty"`
	LastRecord        *storage.SyncRecord `json:"last_record,omitempty"`
}

// SyncResponse defines the response after triggering a manual sync.
type SyncResponse struct {
	Status  string              `json:"status" example:"ok"`
	Message string              `json:"message" example:"sync completed successfully"`
	Record  *storage.SyncRecord `json:"record,omitempty"`
}

// OrdersResponse defines the paginated response for orders.
type OrdersResponse struct {
	Total  int           `json:"total"`
	Limit  int           `json:"limit"`
	Offset int           `json:"offset"`
	Orders []model.Order `json:"orders"`
}

// ItemsResponse defines the paginated response for normalized items.
type ItemsResponse struct {
	Total  int                    `json:"total"`
	Limit  int                    `json:"limit"`
	Offset int                    `json:"offset"`
	Items  []model.NormalizedItem `json:"items"`
}

// Outputs wrapping payloads in Body
type HealthOutput struct {
	Body HealthResponse
}

type StatusOutput struct {
	Body StatusResponse
}

type SyncOutput struct {
	Body SyncResponse
}

type OrdersOutput struct {
	Body OrdersResponse
}

type OrderDetailOutput struct {
	Body model.Order
}

type ItemsOutput struct {
	Body ItemsResponse
}

type StatsOutput struct {
	Body storage.Stats
}

// Sync history
type ListSyncHistoryInput struct {
	Limit  int `query:"limit" default:"10" doc:"Max records"`
	Offset int `query:"offset" default:"0" doc:"Pagination offset"`
}

type SyncHistoryResponse struct {
	Total   int                  `json:"total"`
	Limit   int                  `json:"limit"`
	Offset  int                  `json:"offset"`
	Records []storage.SyncRecord `json:"records"`
}

type SyncHistoryOutput struct {
	Body SyncHistoryResponse
}

// Customers
type ListCustomersInput struct {
	Search string `query:"search" doc:"Search customer name"`
	Area   string `query:"area" doc:"Filter by area"`
	Limit  int    `query:"limit" default:"20" doc:"Max customers"`
	Offset int    `query:"offset" default:"0" doc:"Pagination offset"`
}

type CustomersResponse struct {
	Total     int                       `json:"total"`
	Limit     int                       `json:"limit"`
	Offset    int                       `json:"offset"`
	Customers []storage.CustomerSummary `json:"customers"`
}

type CustomersOutput struct {
	Body CustomersResponse
}

// Areas
type AreasResponse struct {
	Total int                   `json:"total"`
	Areas []storage.AreaSummary `json:"areas"`
}

type AreasOutput struct {
	Body AreasResponse
}

// Search
type SearchInput struct {
	Q     string `query:"q" required:"true" doc:"Search query"`
	Type  string `query:"type" default:"all" doc:"all|orders|items|customers"`
	Limit int    `query:"limit" default:"10" doc:"Results per category"`
}

type SearchOutput struct {
	Body storage.SearchResult
}

// Config
type ConfigResponse struct {
	SyncInterval   string   `json:"sync_interval"`
	WorkHoursStart string   `json:"work_hours_start"`
	WorkHoursEnd   string   `json:"work_hours_end"`
	Timezone       string   `json:"timezone"`
	WorkDays       []string `json:"work_days"`
	SpreadsheetID  string   `json:"spreadsheet_id"`
}

type ConfigOutput struct {
	Body ConfigResponse
}

// System
type SystemResponse struct {
	Version       string                       `json:"version"`
	GoVersion     string                       `json:"go_version"`
	UptimeSeconds int64                        `json:"uptime_seconds"`
	Port          string                       `json:"port"`
	DBPath        string                       `json:"db_path"`
	Tables        map[string]storage.TableStat `json:"tables"`
}

type SystemOutput struct {
	Body SystemResponse
}

// Inputs
type ListOrdersInput struct {
	Customer       string `query:"customer" doc:"Filter by customer name"`
	Date           string `query:"date" doc:"Filter by order date (DD/MM/YYYY)"`
	Tanggal        string `query:"tanggal" doc:"Alias for date filter"`
	Area           string `query:"area" doc:"Filter by area / region"`
	Status         string `query:"status" doc:"Filter by dominant item status_order"`
	OrderNumber    string `query:"order_number" doc:"Filter by E-Katalog order ID (EP-...)"`
	EcatalogNumber string `query:"ecatalog_number" doc:"Alias for order_number"`
	Sort           string `query:"sort" doc:"Sort field"`
	OrderBy        string `query:"order_by" doc:"Alias for sort field"`
	Order          string `query:"order" doc:"Sort direction (asc/desc) or sort field"`
	Dir            string `query:"dir" doc:"Sort direction (asc/desc)"`
	Direction      string `query:"direction" doc:"Alias for sort direction"`
	Limit          int    `query:"limit" default:"50" doc:"Max orders to return (max 1000)"`
	Offset         int    `query:"offset" default:"0" doc:"Pagination offset"`
}

func resolveSortAndOrder(sort, orderBy, order, dir, direction string) (string, string) {
	s := strings.TrimSpace(sort)
	if s == "" {
		s = strings.TrimSpace(orderBy)
	}

	d := strings.TrimSpace(dir)
	if d == "" {
		d = strings.TrimSpace(direction)
	}

	o := strings.TrimSpace(order)
	if strings.EqualFold(o, "asc") || strings.EqualFold(o, "desc") {
		if d == "" {
			d = o
		}
	} else if o != "" && s == "" {
		s = o
	} else if d == "" {
		d = o
	}

	return s, d
}

type GetOrderByIDInput struct {
	ID string `path:"id" doc:"Order ID (e.g. ORD-0001)"`
}

type ListItemsInput struct {
	Customer          string `query:"customer" doc:"Filter by customer name"`
	NamaBarang        string `query:"nama_barang" doc:"Filter by item name"`
	StatusOrder       string `query:"status_order" doc:"Filter by order status"`
	StatusBarang      string `query:"status_barang" doc:"Filter by item status"`
	StatusBarangOther bool   `query:"status_barang_other" doc:"Filter by status barang not in predefined list"`
	Date              string `query:"date" doc:"Filter by date"`
	Tanggal           string `query:"tanggal" doc:"Alias for date"`
	OrderNumber       string `query:"order_number" doc:"Filter by E-Katalog order ID"`
	EcatalogNumber    string `query:"ecatalog_number" doc:"Alias for order_number"`
	Sort              string `query:"sort" doc:"Sort field"`
	OrderBy           string `query:"order_by" doc:"Alias for sort field"`
	Order             string `query:"order" doc:"Sort direction (asc/desc) or sort field"`
	Dir               string `query:"dir" doc:"Sort direction (asc/desc)"`
	Direction         string `query:"direction" doc:"Alias for sort direction"`
	Limit             int    `query:"limit" default:"50" doc:"Max items to return"`
	Offset            int    `query:"offset" default:"0" doc:"Pagination offset"`
}

func (s *Server) handleHealth(ctx context.Context, input *struct{}) (*HealthOutput, error) {
	return &HealthOutput{
		Body: HealthResponse{
			Status: "ok",
		},
	}, nil
}

func (s *Server) handleStatus(ctx context.Context, input *struct{}) (*StatusOutput, error) {
	resp := StatusResponse{
		Status: "IDLE",
	}

	if s.worker != nil {
		ws := s.worker.Status()
		resp.Status = ws.Status
		resp.IsInsideWorkHours = ws.IsInsideWorkHours
		resp.Error = ws.LastError
		if !ws.LastRunTime.IsZero() {
			resp.LastSync = &ws.LastRunTime
		}
		if !ws.NextRunTime.IsZero() {
			resp.NextSync = &ws.NextRunTime
		}
		resp.LastDurationMs = ws.LastDuration.Milliseconds()
	}

	if s.store != nil {
		rec, err := s.store.GetLastSync(ctx)
		if err == nil && rec != nil {
			resp.LastRecord = rec
			if resp.LastSync == nil && !rec.SyncedAt.IsZero() {
				resp.LastSync = &rec.SyncedAt
			}
		}
	}

	return &StatusOutput{Body: resp}, nil
}

func (s *Server) handleSync(ctx context.Context, input *struct{}) (*SyncOutput, error) {
	if s.worker == nil {
		return nil, huma.Error503ServiceUnavailable("sync worker not available")
	}

	if err := s.worker.RunOnce(ctx, true); err != nil {
		return nil, huma.Error500InternalServerError("sync failed: " + err.Error())
	}

	var rec *storage.SyncRecord
	if s.store != nil {
		rec, _ = s.store.GetLastSync(ctx)
	}

	return &SyncOutput{
		Body: SyncResponse{
			Status:  "ok",
			Message: "sync completed successfully",
			Record:  rec,
		},
	}, nil
}

func (s *Server) handleListOrders(ctx context.Context, input *ListOrdersInput) (*OrdersOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	customer := input.Customer
	date := input.Date
	if date == "" {
		date = input.Tanggal
	}
	area := input.Area
	orderNumber := input.OrderNumber
	if orderNumber == "" {
		orderNumber = input.EcatalogNumber
	}
	limit := input.Limit
	offset := input.Offset

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}

	sortField, sortOrder := resolveSortAndOrder(input.Sort, input.OrderBy, input.Order, input.Dir, input.Direction)
	orders, total, err := s.store.GetOrders(ctx, storage.OrderFilter{
		Customer:       customer,
		Date:           date,
		Tanggal:        date,
		Area:           area,
		Status:         input.Status,
		OrderNumber:    orderNumber,
		EcatalogNumber: orderNumber,
		Sort:           sortField,
		Order:          sortOrder,
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}

	if orders == nil {
		orders = []model.Order{}
	}

	return &OrdersOutput{
		Body: OrdersResponse{
			Total:  total,
			Limit:  limit,
			Offset: offset,
			Orders: orders,
		},
	}, nil
}

func (s *Server) handleGetOrderByID(ctx context.Context, input *GetOrderByIDInput) (*OrderDetailOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	order, err := s.store.GetOrderByID(ctx, input.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || strings.Contains(strings.ToLower(err.Error()), "not found") {
			return nil, huma.Error404NotFound("order not found")
		}
		return nil, huma.Error500InternalServerError(err.Error())
	}

	return &OrderDetailOutput{
		Body: *order,
	}, nil
}

func (s *Server) handleListItems(ctx context.Context, input *ListItemsInput) (*ItemsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	customer := input.Customer
	namaBarang := input.NamaBarang
	statusOrder := input.StatusOrder
	date := input.Date
	if date == "" {
		date = input.Tanggal
	}
	orderNumber := input.OrderNumber
	if orderNumber == "" {
		orderNumber = input.EcatalogNumber
	}
	limit := input.Limit
	offset := input.Offset

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}

	sortField, sortOrder := resolveSortAndOrder(input.Sort, input.OrderBy, input.Order, input.Dir, input.Direction)
	items, total, err := s.store.GetItems(ctx, storage.ItemFilter{
		Customer:          customer,
		NamaBarang:        namaBarang,
		StatusOrder:       statusOrder,
		StatusBarang:      input.StatusBarang,
		StatusBarangOther: input.StatusBarangOther,
		Date:              date,
		Tanggal:           date,
		OrderNumber:       orderNumber,
		EcatalogNumber:    orderNumber,
		Sort:              sortField,
		Order:             sortOrder,
		Limit:             limit,
		Offset:            offset,
	})
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}

	if items == nil {
		items = []model.NormalizedItem{}
	}

	return &ItemsOutput{
		Body: ItemsResponse{
			Total:  total,
			Limit:  limit,
			Offset: offset,
			Items:  items,
		},
	}, nil
}

// ListDeliveriesInput defines query filters for deliveries.
type ListDeliveriesInput struct {
	Customer       string `query:"customer" doc:"Filter by customer name"`
	NamaBarang     string `query:"nama_barang" doc:"Filter by item name"`
	StatusOrder    string `query:"status_order" doc:"Filter by order status"`
	Date           string `query:"date" doc:"Filter by date"`
	Tanggal        string `query:"tanggal" doc:"Filter by date alias"`
	OrderNumber    string `query:"order_number" doc:"Filter by order number"`
	EcatalogNumber string `query:"ecatalog_number" doc:"Filter by e-katalog number"`
	Sort           string `query:"sort" doc:"Sort field (date, customer, status)"`
	OrderBy        string `query:"order_by" doc:"Alias for sort field"`
	Order          string `query:"order" doc:"Sort direction (asc/desc) or sort field"`
	Dir            string `query:"dir" doc:"Sort direction (asc/desc)"`
	Direction      string `query:"direction" doc:"Alias for sort direction"`
	Limit          int    `query:"limit" default:"25" doc:"Max records to return"`
	Offset         int    `query:"offset" default:"0" doc:"Pagination offset"`
}

// DeliveriesResponse defines the paginated response for delivery shipments.
type DeliveriesResponse struct {
	Total      int                    `json:"total"`
	Limit      int                    `json:"limit"`
	Offset     int                    `json:"offset"`
	Deliveries []storage.DeliveryItem `json:"deliveries"`
}

type DeliveriesOutput struct {
	Body DeliveriesResponse
}

func (s *Server) handleListDeliveries(ctx context.Context, input *ListDeliveriesInput) (*DeliveriesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	customer := input.Customer
	namaBarang := input.NamaBarang
	statusOrder := input.StatusOrder
	date := input.Date
	if date == "" {
		date = input.Tanggal
	}
	orderNumber := input.OrderNumber
	if orderNumber == "" {
		orderNumber = input.EcatalogNumber
	}
	limit := input.Limit
	offset := input.Offset

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}

	sortField, sortOrder := resolveSortAndOrder(input.Sort, input.OrderBy, input.Order, input.Dir, input.Direction)
	deliveries, total, err := s.store.GetDeliveries(ctx, storage.DeliveryFilter{
		Customer:       customer,
		NamaBarang:     namaBarang,
		StatusOrder:    statusOrder,
		Date:           date,
		Tanggal:        date,
		OrderNumber:    orderNumber,
		EcatalogNumber: orderNumber,
		Sort:           sortField,
		Order:          sortOrder,
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}

	if deliveries == nil {
		deliveries = []storage.DeliveryItem{}
	}

	return &DeliveriesOutput{
		Body: DeliveriesResponse{
			Total:      total,
			Limit:      limit,
			Offset:     offset,
			Deliveries: deliveries,
		},
	}, nil
}

type DeliveryStatsOutput struct {
	Body storage.DeliveryStats
}

func (s *Server) handleGetDeliveryStats(ctx context.Context, input *struct{}) (*DeliveryStatsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	stats, err := s.store.GetDeliveryStats(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}
	return &DeliveryStatsOutput{Body: *stats}, nil
}

func (s *Server) handleGetStats(ctx context.Context, input *struct{}) (*StatsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	stats, err := s.store.GetStats(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}

	return &StatsOutput{
		Body: *stats,
	}, nil
}

func (s *Server) handleListSyncHistory(ctx context.Context, input *ListSyncHistoryInput) (*SyncHistoryOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	limit := input.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	offset := input.Offset
	if offset < 0 {
		offset = 0
	}

	records, total, err := s.store.GetSyncHistory(ctx, limit, offset)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}
	return &SyncHistoryOutput{
		Body: SyncHistoryResponse{
			Total:   total,
			Limit:   limit,
			Offset:  offset,
			Records: records,
		},
	}, nil
}

func (s *Server) handleListCustomers(ctx context.Context, input *ListCustomersInput) (*CustomersOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	limit := input.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	offset := input.Offset
	if offset < 0 {
		offset = 0
	}

	custs, total, err := s.store.GetCustomers(ctx, input.Search, input.Area, limit, offset)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}
	return &CustomersOutput{
		Body: CustomersResponse{
			Total:     total,
			Limit:     limit,
			Offset:    offset,
			Customers: custs,
		},
	}, nil
}

func (s *Server) handleListAreas(ctx context.Context, input *struct{}) (*AreasOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	areas, err := s.store.GetAreas(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}
	return &AreasOutput{
		Body: AreasResponse{
			Total: len(areas),
			Areas: areas,
		},
	}, nil
}

func (s *Server) handleSearch(ctx context.Context, input *SearchInput) (*SearchOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	res, err := s.store.SearchAll(ctx, input.Q, input.Type, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError(err.Error())
	}
	return &SearchOutput{
		Body: *res,
	}, nil
}

func (s *Server) handleConfig(ctx context.Context, input *struct{}) (*ConfigOutput, error) {
	cfg := s.appConfig
	if cfg == nil {
		def := config.DefaultConfig()
		cfg = &def
	}
	resp := ConfigResponse{
		SyncInterval:   cfg.SyncInterval.String(),
		WorkHoursStart: cfg.WorkHoursStart,
		WorkHoursEnd:   cfg.WorkHoursEnd,
		Timezone:       cfg.Timezone,
		WorkDays:       []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"},
		SpreadsheetID:  cfg.SpreadsheetID,
	}
	return &ConfigOutput{Body: resp}, nil
}

func (s *Server) handleSystem(ctx context.Context, input *struct{}) (*SystemOutput, error) {
	cfg := s.appConfig
	port := "8080"
	dbPath := "data/warehouse.db"
	if cfg != nil {
		port = cfg.Port
		dbPath = cfg.DBPath
	}

	var tables map[string]storage.TableStat
	if s.store != nil {
		tStats, err := s.store.GetTableStats(ctx)
		if err == nil {
			tables = tStats
		}
	}
	if tables == nil {
		tables = make(map[string]storage.TableStat)
	}

	uptime := int64(0)
	if !s.startTime.IsZero() {
		uptime = int64(time.Since(s.startTime).Seconds())
	}

	resp := SystemResponse{
		Version:       version.Version,
		GoVersion:     runtime.Version(),
		UptimeSeconds: uptime,
		Port:          port,
		DBPath:        dbPath,
		Tables:        tables,
	}
	return &SystemOutput{Body: resp}, nil
}

func (s *Server) handleExportItems(c fiber.Ctx) error {
	if err := s.requireRole(c, "user"); err != nil {
		return err
	}
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).SendString("storage service not available")
	}

	customer := c.Query("customer")
	namaBarang := c.Query("nama_barang")
	statusOrder := c.Query("status_order")
	statusBarang := c.Query("status_barang")
	statusBarangOther := c.Query("status_barang_other") == "true" || strings.EqualFold(statusBarang, "other")
	sortField := c.Query("sort")
	sortOrder := c.Query("order")
	date := c.Query("date")
	if date == "" {
		date = c.Query("tanggal")
	}

	items, _, err := s.store.GetItems(c.Context(), storage.ItemFilter{
		Customer:          customer,
		NamaBarang:        namaBarang,
		StatusOrder:       statusOrder,
		StatusBarang:      statusBarang,
		StatusBarangOther: statusBarangOther,
		Date:              date,
		Tanggal:           date,
		Sort:              sortField,
		Order:             sortOrder,
		Limit:             0,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
	}

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="items.csv"`)

	writer := csv.NewWriter(c)
	header := []string{
		"Row", "Order Number", "Tanggal", "Customer", "Area",
		"Nama Barang", "Jumlah", "Satuan", "Status Order", "Status Barang",
		"Tanggal Pengiriman", "Lead Time", "Jumlah Terkirim", "Belum Terkirim",
		"Keterangan", "Catatan",
	}
	if err := writer.Write(header); err != nil {
		return err
	}

	for _, it := range items {
		dateStr := ""
		if !it.Tanggal.IsZero() {
			dateStr = it.Tanggal.UTC().Format("2006-01-02")
		}
		row := []string{
			strconv.Itoa(it.RowIndex),
			it.OrderNumber,
			dateStr,
			it.Customer,
			it.Area,
			it.NamaBarang,
			it.Jumlah,
			it.Satuan,
			it.StatusOrder,
			it.StatusBarang,
			it.TanggalPengiriman,
			it.LeadTimePengiriman,
			it.JumlahTerkirim,
			it.BelumTerkirim,
			it.Keterangan,
			it.Catatan,
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	writer.Flush()
	return writer.Error()
}
func (s *Server) handleExportCustomerAliases(c fiber.Ctx) error {
	if err := s.requireRole(c, "user"); err != nil {
		return err
	}
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).SendString("storage service not available")
	}

	jsonData, err := s.store.ExportCustomerAliasesJSON(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
	}

	c.Set("Content-Type", "application/json; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="customer-aliases.json"`)
	c.Set("Cache-Control", "no-store")

	return c.Send(jsonData)
}

func (s *Server) handleImportCustomerAliases(c fiber.Ctx) error {
	if err := s.requireRole(c, "admin"); err != nil {
		return err
	}
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "storage service not available"})
	}

	mode := c.Query("mode", "merge")
	if mode == "" {
		mode = "merge"
	}
	normMode := strings.ToLower(strings.TrimSpace(mode))
	if normMode != "merge" && normMode != "replace" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("invalid import mode %q: must be merge or replace", mode)})
	}

	const maxImportSize = 5 << 20 // 5MB

	var data []byte
	ct := c.Get("Content-Type")

	if strings.HasPrefix(ct, "multipart/form-data") {
		file, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing file in multipart request"})
		}
		if file.Size > maxImportSize {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "import file too large (max 5MB)"})
		}
		f, err := file.Open()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to open uploaded file"})
		}
		defer f.Close()

		data, err = io.ReadAll(io.LimitReader(f, maxImportSize+1))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read uploaded file"})
		}
		if int64(len(data)) > maxImportSize {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "import file too large (max 5MB)"})
		}
	} else {
		body := c.Body()
		if int64(len(body)) > maxImportSize {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "import file too large (max 5MB)"})
		}
		data = body
	}

	res, err := s.store.ImportCustomerAliasesJSON(c.Context(), data, normMode)
	if err != nil {
		if storage.IsValidationError(err) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	errorsList := res.Errors
	if errorsList == nil {
		errorsList = []string{}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status":   "ok",
		"imported": res.Imported,
		"skipped":  res.Skipped,
		"errors":   errorsList,
	})
}

func (s *Server) handleSyncSSE(c fiber.Ctx) error {
	if err := s.requireRole(c, "user"); err != nil {
		return err
	}
	if s.worker == nil {
		return c.Status(fiber.StatusServiceUnavailable).SendString("worker service not available")
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	ctx := c.Context()

	return c.SendStreamWriter(func(w *bufio.Writer) {
		ch := s.worker.Subscribe()
		defer s.worker.Unsubscribe(ch)

		// Send initial status event
		ws := s.worker.Status()
		initEvt := worker.SyncEvent{
			Status: ws.Status,
		}
		initData, _ := json.Marshal(initEvt)
		_, _ = fmt.Fprintf(w, "event: sync\ndata: %s\n\n", initData)
		if err := w.Flush(); err != nil {
			return
		}

		for {
			select {
			case evt, ok := <-ch:
				if !ok {
					return
				}
				data, _ := json.Marshal(evt)
				_, _ = fmt.Fprintf(w, "event: sync\ndata: %s\n\n", data)
				if err := w.Flush(); err != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	})
}

// CustomerAliasesResponse defines the payload for customer aliases.
type CustomerAliasesResponse struct {
	Groups []storage.CustomerAliasGroup `json:"groups"`
}

type CustomerAliasesOutput struct {
	Body CustomerAliasesResponse
}

type SetCustomerAliasInput struct {
	Body struct {
		Alias     string `json:"alias" doc:"Variant spelling alias" example:"PKU Muhammadiyah"`
		Canonical string `json:"canonical" doc:"Canonical customer name" example:"RS PKU Muhammadiyah"`
		Area      string `json:"area,omitempty" doc:"Linked area for this customer" example:"Lombok Barat"`
	}
}

type DeleteCustomerAliasInput struct {
	Alias string `path:"alias" doc:"Variant spelling alias to remove"`
}

type StatusOKResponse struct {
	Status string `json:"status" example:"ok"`
}

type StatusOKOutput struct {
	Body StatusOKResponse
}

func (s *Server) handleGetCustomerAliases(ctx context.Context, input *struct{}) (*CustomerAliasesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	groups, err := s.store.GetCustomerAliasesGrouped(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get customer aliases", err)
	}
	return &CustomerAliasesOutput{
		Body: CustomerAliasesResponse{
			Groups: groups,
		},
	}, nil
}

func (s *Server) handleSetCustomerAlias(ctx context.Context, input *SetCustomerAliasInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	alias := strings.TrimSpace(input.Body.Alias)
	canonical := strings.TrimSpace(input.Body.Canonical)
	area := strings.TrimSpace(input.Body.Area)
	if alias == "" || canonical == "" {
		return nil, huma.Error400BadRequest("alias and canonical cannot be empty")
	}
	if alias == canonical {
		return nil, huma.Error400BadRequest("alias cannot be equal to canonical name")
	}

	if err := s.store.SetCustomerAlias(ctx, alias, canonical, area); err != nil {
		return nil, huma.Error500InternalServerError("failed to set customer alias", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

func (s *Server) handleDeleteCustomerAlias(ctx context.Context, input *DeleteCustomerAliasInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	alias := strings.TrimSpace(input.Alias)
	if unescaped, err := url.PathUnescape(alias); err == nil && unescaped != "" {
		alias = strings.TrimSpace(unescaped)
	}
	if alias == "" {
		return nil, huma.Error400BadRequest("alias cannot be empty")
	}

	if err := s.store.DeleteCustomerAlias(ctx, alias); err != nil {
		return nil, huma.Error500InternalServerError("failed to delete customer alias", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

// WorkdayPoliciesResponse defines the payload for workday policies.
type WorkdayPoliciesResponse struct {
	Policies []model.WorkdayPolicy `json:"policies"`
}

type WorkdayPoliciesOutput struct {
	Body WorkdayPoliciesResponse
}

type SetWorkdayPolicyInput struct {
	Body struct {
		WorkDays []string `json:"work_days" doc:"Canonical English weekday names (Monday..Sunday)"`
	}
}

var canonicalWeekdaySet = map[string]bool{
	"Monday":    true,
	"Tuesday":   true,
	"Wednesday": true,
	"Thursday":  true,
	"Friday":    true,
	"Saturday":  true,
	"Sunday":    true,
}

func (s *Server) handleGetWorkdayPolicies(ctx context.Context, input *struct{}) (*WorkdayPoliciesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	policies, err := s.store.GetWorkdayPolicies(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get workday policies", err)
	}
	return &WorkdayPoliciesOutput{
		Body: WorkdayPoliciesResponse{
			Policies: policies,
		},
	}, nil
}

func (s *Server) handleSetWorkdayPolicy(ctx context.Context, input *SetWorkdayPolicyInput) (*WorkdayPoliciesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}

	days := input.Body.WorkDays
	if len(days) == 0 {
		return nil, huma.Error400BadRequest("work_days cannot be empty")
	}

	seen := make(map[string]bool)
	var validatedDays []string
	for _, day := range days {
		dayTrimmed := strings.TrimSpace(day)
		if !canonicalWeekdaySet[dayTrimmed] {
			return nil, huma.Error400BadRequest(fmt.Sprintf("invalid weekday name %q, must be canonical English name (e.g. Monday)", day))
		}
		if seen[dayTrimmed] {
			return nil, huma.Error400BadRequest(fmt.Sprintf("duplicate weekday %q", dayTrimmed))
		}
		seen[dayTrimmed] = true
		validatedDays = append(validatedDays, dayTrimmed)
	}

	tzStr := config.DefaultConfig().Timezone
	if s.appConfig != nil && strings.TrimSpace(s.appConfig.Timezone) != "" {
		tzStr = s.appConfig.Timezone
	}
	loc, err := worker.ParseTimezone(tzStr)
	if err != nil {
		loc = time.UTC
	}
	effectiveFrom := time.Now().In(loc).Format("2006-01-02")

	if err := s.store.SetWorkdayPolicy(ctx, effectiveFrom, validatedDays); err != nil {
		return nil, huma.Error500InternalServerError("failed to set workday policy", err)
	}

	policies, err := s.store.GetWorkdayPolicies(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to load updated workday policies", err)
	}

	return &WorkdayPoliciesOutput{
		Body: WorkdayPoliciesResponse{
			Policies: policies,
		},
	}, nil
}

type PageDesignsOutput struct {
	Body struct {
		Designs []model.PageDesign `json:"designs"`
	}
}

type CreatePageDesignOutput struct {
	Body struct {
		Status string `json:"status"`
		ID     int64  `json:"id"`
	}
}

type CreatePageDesignInput struct {
	Body model.PageDesign
}

type UpdatePageDesignInput struct {
	ID   int64 `path:"id" doc:"Page design ID"`
	Body model.PageDesign
}

type DeletePageDesignInput struct {
	ID int64 `path:"id" doc:"Page design ID"`
}

func validatePageDesign(d *model.PageDesign) error {
	d.Name = strings.TrimSpace(d.Name)
	if d.Name == "" {
		return huma.Error400BadRequest("name cannot be empty")
	}
	if d.LabelWidthMM <= 0 {
		return huma.Error400BadRequest("label_width_mm must be greater than 0")
	}
	if d.LabelHeightMM <= 0 {
		return huma.Error400BadRequest("label_height_mm must be greater than 0")
	}
	if d.Cols < 1 {
		return huma.Error400BadRequest("cols must be at least 1")
	}
	if d.Rows < 1 {
		return huma.Error400BadRequest("rows must be at least 1")
	}
	if d.PaperWidthMM < 0 {
		return huma.Error400BadRequest("paper_width_mm cannot be negative")
	}
	if d.PaperHeightMM < 0 {
		return huma.Error400BadRequest("paper_height_mm cannot be negative")
	}
	if d.PaperWidthMM == 0 {
		d.PaperWidthMM = 210
	}
	if d.PaperHeightMM == 0 {
		d.PaperHeightMM = 297
	}
	d.Paper = strings.TrimSpace(d.Paper)
	if d.Paper == "" {
		d.Paper = "A4"
	}
	return nil
}

func (s *Server) handleGetPageDesigns(ctx context.Context, input *struct{}) (*PageDesignsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	designs, err := s.store.GetPageDesigns(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get page designs", err)
	}
	out := &PageDesignsOutput{}
	out.Body.Designs = designs
	return out, nil
}

func (s *Server) handleCreatePageDesign(ctx context.Context, input *CreatePageDesignInput) (*CreatePageDesignOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	design := input.Body
	if err := validatePageDesign(&design); err != nil {
		return nil, err
	}
	id, err := s.store.CreatePageDesign(ctx, design)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create page design", err)
	}
	out := &CreatePageDesignOutput{}
	out.Body.Status = "ok"
	out.Body.ID = id
	return out, nil
}

func (s *Server) handleUpdatePageDesign(ctx context.Context, input *UpdatePageDesignInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid page design id")
	}
	design := input.Body
	if err := validatePageDesign(&design); err != nil {
		return nil, err
	}
	if err := s.store.UpdatePageDesign(ctx, input.ID, design); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("page design %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to update page design", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

func (s *Server) handleDeletePageDesign(ctx context.Context, input *DeletePageDesignInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid page design id")
	}
	if err := s.store.DeletePageDesign(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("page design %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete page design", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

type LabelLayoutPresetsOutput struct {
	Body struct {
		Presets []model.LabelLayoutPreset `json:"presets"`
	}
}

type CreateLabelLayoutPresetOutput struct {
	Body struct {
		Status string `json:"status"`
		ID     int64  `json:"id"`
	}
}

type CreateLabelLayoutPresetInput struct {
	Body model.LabelLayoutPreset
}

type UpdateLabelLayoutPresetInput struct {
	ID   int64 `path:"id" doc:"Label layout preset ID"`
	Body model.LabelLayoutPreset
}

type LabelLayoutPresetIDInput struct {
	ID int64 `path:"id" doc:"Label layout preset ID"`
}

func validateLabelLayoutPreset(preset *model.LabelLayoutPreset) error {
	preset.Name = strings.TrimSpace(preset.Name)
	if preset.Name == "" {
		return huma.Error400BadRequest("name cannot be empty")
	}
	if !json.Valid([]byte(preset.LabelLayout)) {
		return huma.Error400BadRequest("label_layout must be valid JSON")
	}
	return nil
}

func (s *Server) handleGetLabelLayoutPresets(ctx context.Context, input *struct{}) (*LabelLayoutPresetsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	presets, err := s.store.GetLabelLayoutPresets(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get label layout presets", err)
	}
	out := &LabelLayoutPresetsOutput{}
	out.Body.Presets = presets
	return out, nil
}

func (s *Server) handleCreateLabelLayoutPreset(ctx context.Context, input *CreateLabelLayoutPresetInput) (*CreateLabelLayoutPresetOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	preset := input.Body
	if err := validateLabelLayoutPreset(&preset); err != nil {
		return nil, err
	}
	id, err := s.store.CreateLabelLayoutPreset(ctx, preset)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create label layout preset", err)
	}
	out := &CreateLabelLayoutPresetOutput{}
	out.Body.Status = "ok"
	out.Body.ID = id
	return out, nil
}

func (s *Server) handleUpdateLabelLayoutPreset(ctx context.Context, input *UpdateLabelLayoutPresetInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid label layout preset id")
	}
	preset := input.Body
	if err := validateLabelLayoutPreset(&preset); err != nil {
		return nil, err
	}
	if err := s.store.UpdateLabelLayoutPreset(ctx, input.ID, preset); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("label layout preset %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to update label layout preset", err)
	}
	return &StatusOKOutput{Body: StatusOKResponse{Status: "ok"}}, nil
}

func (s *Server) handleDeleteLabelLayoutPreset(ctx context.Context, input *LabelLayoutPresetIDInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid label layout preset id")
	}
	if err := s.store.DeleteLabelLayoutPreset(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("label layout preset %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete label layout preset", err)
	}
	return &StatusOKOutput{Body: StatusOKResponse{Status: "ok"}}, nil
}

type SetLocaleInput struct {
	Body struct {
		Locale string `json:"locale" enum:"en,id" doc:"Preferred language locale ('en' or 'id')"`
	}
}

type SetLocaleOutput struct {
	Body struct {
		Locale string `json:"locale"`
	}
}

func (s *Server) handleSetUserLocale(ctx context.Context, input *SetLocaleInput) (*SetLocaleOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	locale := strings.ToLower(strings.TrimSpace(input.Body.Locale))
	if locale != "en" && locale != "id" {
		return nil, huma.Error400BadRequest("invalid locale: must be 'en' or 'id'")
	}
	claims := claimsFromContext(ctx)
	var email string
	if claims != nil {
		email = claims.Email
	}
	if email == "" {
		return &SetLocaleOutput{Body: struct {
			Locale string `json:"locale"`
		}{Locale: locale}}, nil
	}
	if err := s.store.UpdateUserLocale(ctx, email, locale); err != nil {
		return nil, huma.Error500InternalServerError("failed to update locale", err)
	}
	return &SetLocaleOutput{Body: struct {
		Locale string `json:"locale"`
	}{Locale: locale}}, nil
}
