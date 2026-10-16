package api

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/gofiber/fiber/v3"
)

// ErrorResponse defines the standard error payload.
type ErrorResponse struct {
	Error string `json:"error" example:"not found"`
}

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

// handleHealth godoc
// @Summary      Health check
// @Description  Check the health and readiness of the API service
// @Tags         system
// @Produce      json
// @Success      200  {object}  HealthResponse
// @Router       /health [get]
func (s *Server) handleHealth(c fiber.Ctx) error {
	return c.JSON(HealthResponse{
		Status: "ok",
	})
}

// handleStatus godoc
// @Summary      Get worker status
// @Description  Get background worker synchronization status and work hours info
// @Tags         worker
// @Produce      json
// @Success      200  {object}  StatusResponse
// @Failure      500  {object}  ErrorResponse
// @Router       /api/v1/status [get]
func (s *Server) handleStatus(c fiber.Ctx) error {
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
		rec, err := s.store.GetLastSync(c.Context())
		if err == nil && rec != nil {
			resp.LastRecord = rec
			if resp.LastSync == nil && !rec.SyncedAt.IsZero() {
				resp.LastSync = &rec.SyncedAt
			}
		}
	}

	return c.JSON(resp)
}

// handleSync godoc
// @Summary      Trigger manual sync
// @Description  Trigger an immediate synchronization from remote data source into local storage (force=true)
// @Tags         worker
// @Produce      json
// @Success      200  {object}  SyncResponse
// @Failure      500  {object}  ErrorResponse
// @Failure      503  {object}  ErrorResponse
// @Router       /api/v1/sync [post]
func (s *Server) handleSync(c fiber.Ctx) error {
	if s.worker == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Error: "sync worker not available",
		})
	}

	if err := s.worker.RunOnce(c.Context(), true); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: "sync failed: " + err.Error(),
		})
	}

	var rec *storage.SyncRecord
	if s.store != nil {
		rec, _ = s.store.GetLastSync(c.Context())
	}

	return c.JSON(SyncResponse{
		Status:  "ok",
		Message: "sync completed successfully",
		Record:  rec,
	})
}

// handleListOrders godoc
// @Summary      List orders
// @Description  List orders with pagination and filters (customer, date, area, order_number, ecatalog_number)
// @Tags         orders
// @Produce      json
// @Param        customer        query     string  false  "Customer name or substring"
// @Param        date            query     string  false  "Order date (e.g. 02/01/2026)"
// @Param        area            query     string  false  "Area name or substring"
// @Param        order_number    query     string  false  "Order number or E-Katalog number (e.g. EP-01...)"
// @Param        ecatalog_number query     string  false  "Alias for order_number"
// @Param        limit           query     int     false  "Number of items to return (default 50, max 1000)"
// @Param        offset          query     int     false  "Offset for pagination (default 0)"
// @Success      200             {object}  OrdersResponse
// @Failure      500             {object}  ErrorResponse
// @Failure      503             {object}  ErrorResponse
// @Router       /api/v1/orders [get]
func (s *Server) handleListOrders(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Error: "storage service not available",
		})
	}

	customer := c.Query("customer")
	date := c.Query("date")
	if date == "" {
		date = c.Query("tanggal")
	}
	area := c.Query("area")
	orderNumber := c.Query("order_number")
	if orderNumber == "" {
		orderNumber = c.Query("ecatalog_number")
	}
	limit := queryInt(c, "limit", 50)
	offset := queryInt(c, "offset", 0)

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}

	orders, total, err := s.store.GetOrders(c.Context(), storage.OrderFilter{
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
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: err.Error(),
		})
	}

	if orders == nil {
		orders = []model.Order{}
	}

	return c.JSON(OrdersResponse{
		Total:  total,
		Limit:  limit,
		Offset: offset,
		Orders: orders,
	})
}

// handleGetOrderByID godoc
// @Summary      Get order by ID
// @Description  Get a single order by its ID with all line items
// @Tags         orders
// @Produce      json
// @Param        id   path      string  true  "Order ID"
// @Success      200  {object}  model.Order
// @Failure      400  {object}  ErrorResponse
// @Failure      404  {object}  ErrorResponse
// @Failure      500  {object}  ErrorResponse
// @Failure      503  {object}  ErrorResponse
// @Router       /api/v1/orders/{id} [get]
func (s *Server) handleGetOrderByID(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Error: "storage service not available",
		})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error: "order id is required",
		})
	}

	order, err := s.store.GetOrderByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || strings.Contains(strings.ToLower(err.Error()), "not found") {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error: "order not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: err.Error(),
		})
	}

	return c.JSON(order)
}

// handleListItems godoc
// @Summary      List items
// @Description  List normalized line items with pagination and filters (customer, nama_barang, status_order, date, order_number, ecatalog_number)
// @Tags         items
// @Produce      json
// @Param        customer        query     string  false  "Customer name or substring"
// @Param        nama_barang     query     string  false  "Item name or substring"
// @Param        status_order    query     string  false  "Order status (e.g. SELESAI, PROSES, PENDING)"
// @Param        date            query     string  false  "Date (e.g. 02/01/2026)"
// @Param        order_number    query     string  false  "Order number or E-Katalog number (e.g. EP-01...)"
// @Param        ecatalog_number query     string  false  "Alias for order_number"
// @Param        limit           query     int     false  "Number of items to return (default 50, max 1000)"
// @Param        offset          query     int     false  "Offset for pagination (default 0)"
// @Success      200             {object}  ItemsResponse
// @Failure      500             {object}  ErrorResponse
// @Failure      503             {object}  ErrorResponse
// @Router       /api/v1/items [get]
func (s *Server) handleListItems(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Error: "storage service not available",
		})
	}

	customer := c.Query("customer")
	namaBarang := c.Query("nama_barang")
	statusOrder := c.Query("status_order")
	date := c.Query("date")
	if date == "" {
		date = c.Query("tanggal")
	}
	orderNumber := c.Query("order_number")
	if orderNumber == "" {
		orderNumber = c.Query("ecatalog_number")
	}
	limit := queryInt(c, "limit", 50)
	offset := queryInt(c, "offset", 0)

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	if offset < 0 {
		offset = 0
	}

	items, total, err := s.store.GetItems(c.Context(), storage.ItemFilter{
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
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: err.Error(),
		})
	}

	if items == nil {
		items = []model.NormalizedItem{}
	}

	return c.JSON(ItemsResponse{
		Total:  total,
		Limit:  limit,
		Offset: offset,
		Items:  items,
	})
}

// handleGetStats godoc
// @Summary      Get stats
// @Description  Get aggregated summary statistics of orders and items
// @Tags         stats
// @Produce      json
// @Success      200  {object}  storage.Stats
// @Failure      500  {object}  ErrorResponse
// @Failure      503  {object}  ErrorResponse
// @Router       /api/v1/stats [get]
func (s *Server) handleGetStats(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Error: "storage service not available",
		})
	}

	stats, err := s.store.GetStats(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: err.Error(),
		})
	}

	return c.JSON(stats)
}

func queryInt(c fiber.Ctx, key string, defaultVal int) int {
	valStr := c.Query(key)
	if valStr == "" {
		return defaultVal
	}
	val, err := strconv.Atoi(valStr)
	if err != nil {
		return defaultVal
	}
	return val
}
