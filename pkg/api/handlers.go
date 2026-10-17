package api

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
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
	Total     int                      `json:"total"`
	Limit     int                      `json:"limit"`
	Offset    int                      `json:"offset"`
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
	Limit          int    `query:"limit" default:"50" doc:"Max orders to return (max 1000)"`
	Offset         int    `query:"offset" default:"0" doc:"Pagination offset"`
}

type GetOrderByIDInput struct {
	ID string `path:"id" doc:"Order ID (e.g. ORD-0001)"`
}

type ListItemsInput struct {
	Customer       string `query:"customer" doc:"Filter by customer name"`
	NamaBarang     string `query:"nama_barang" doc:"Filter by item name"`
	StatusOrder    string `query:"status_order" doc:"Filter by order status"`
	Date           string `query:"date" doc:"Filter by date"`
	Tanggal        string `query:"tanggal" doc:"Alias for date"`
	OrderNumber    string `query:"order_number" doc:"Filter by E-Katalog order ID"`
	EcatalogNumber string `query:"ecatalog_number" doc:"Alias for order_number"`
	Limit          int    `query:"limit" default:"50" doc:"Max items to return"`
	Offset         int    `query:"offset" default:"0" doc:"Pagination offset"`
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

	orders, total, err := s.store.GetOrders(ctx, storage.OrderFilter{
		Customer:       customer,
		Date:           date,
		Tanggal:        date,
		Area:           area,
		Status:         input.Status,
		OrderNumber:    orderNumber,
		EcatalogNumber: orderNumber,
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

	items, total, err := s.store.GetItems(ctx, storage.ItemFilter{
		Customer:       customer,
		NamaBarang:     namaBarang,
		StatusOrder:    statusOrder,
		Date:           date,
		Tanggal:        date,
		OrderNumber:    orderNumber,
		EcatalogNumber: orderNumber,
		Limit:          limit,
		Offset:         offset,
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

	deliveries, total, err := s.store.GetDeliveries(ctx, storage.DeliveryFilter{
		Customer:       customer,
		NamaBarang:     namaBarang,
		StatusOrder:    statusOrder,
		Date:           date,
		Tanggal:        date,
		OrderNumber:    orderNumber,
		EcatalogNumber: orderNumber,
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
		Version:       "v1.0.0",
		GoVersion:     runtime.Version(),
		UptimeSeconds: uptime,
		Port:          port,
		DBPath:        dbPath,
		Tables:        tables,
	}
	return &SystemOutput{Body: resp}, nil
}

func (s *Server) handleExportItems(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).SendString("storage service not available")
	}

	customer := c.Query("customer")
	namaBarang := c.Query("nama_barang")
	statusOrder := c.Query("status_order")
	date := c.Query("date")
	if date == "" {
		date = c.Query("tanggal")
	}

	items, _, err := s.store.GetItems(c.Context(), storage.ItemFilter{
		Customer:    customer,
		NamaBarang:  namaBarang,
		StatusOrder: statusOrder,
		Date:        date,
		Tanggal:     date,
		Limit:       0,
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
		row := []string{
			strconv.Itoa(it.RowIndex),
			it.OrderNumber,
			it.Tanggal,
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

func (s *Server) handleSyncSSE(c fiber.Ctx) error {
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
	if strings.EqualFold(alias, canonical) {
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
