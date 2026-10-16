package api

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/danielgtaylor/huma/v2"
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

// Inputs
type ListOrdersInput struct {
	Customer       string `query:"customer" doc:"Filter by customer name"`
	Date           string `query:"date" doc:"Filter by order date (DD/MM/YYYY)"`
	Tanggal        string `query:"tanggal" doc:"Alias for date filter"`
	Area           string `query:"area" doc:"Filter by area / region"`
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
