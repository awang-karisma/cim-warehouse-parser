package api

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/version"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/static"
)

// Config holds dependencies for creating an API Server.
type Config struct {
	Store     *storage.Storage
	Worker    *worker.Worker
	AppConfig *config.Config
}

// Server wraps the Fiber v3 HTTP application and Huma v2 API.
type Server struct {
	app       *fiber.App
	humaAPI   huma.API
	store     *storage.Storage
	worker    *worker.Worker
	appConfig *config.Config
	startTime time.Time
}

// New creates and initializes a new Fiber v3 API Server with middlewares and routes.
func New(cfg Config) *Server {
	app := fiber.New(fiber.Config{
		AppName:   "Warehouse Order Tracking API",
		BodyLimit: 10 * 1024 * 1024,
	})

	// Middlewares
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New())

	humaCfg := huma.DefaultConfig("Warehouse Order Tracking API", version.Version)
	humaCfg.DocsRenderer = huma.DocsRendererScalar
	humaCfg.DocsPath = "/docs"
	humaCfg.OpenAPIPath = "/openapi"
	humaAPI := humafiber.New(app, humaCfg)

	s := &Server{
		app:       app,
		humaAPI:   humaAPI,
		store:     cfg.Store,
		worker:    cfg.Worker,
		appConfig: cfg.AppConfig,
		startTime: time.Now(),
	}

	s.registerOperations()

	// Raw Fiber routes
	app.Get("/api/v1/items/export", s.handleExportItems)
	app.Get("/api/v1/sync/events", s.handleSyncSSE)
	app.Get("/api/v1/customer-aliases/export", s.handleExportCustomerAliases)
	app.Post("/api/v1/customer-aliases/import", s.handleImportCustomerAliases)
	return s
}

// App returns the underlying Fiber app instance.
func (s *Server) App() *fiber.App {
	return s.app
}

// HumaAPI returns the underlying Huma API instance.
func (s *Server) HumaAPI() huma.API {
	return s.humaAPI
}

// SetupStaticFiles configures static asset serving and SPA fallback to index.html.
func (s *Server) SetupStaticFiles(distPath string) {
	s.app.Use("/assets", static.New(filepath.Join(distPath, "assets")))
	s.app.Get("/*", func(c fiber.Ctx) error {
		p := c.Path()
		if strings.HasPrefix(p, "/api") || strings.HasPrefix(p, "/health") || strings.HasPrefix(p, "/docs") || strings.HasPrefix(p, "/openapi") {
			return c.Next()
		}
		targetFile := filepath.Join(distPath, filepath.Clean(p))
		if info, err := os.Stat(targetFile); err == nil && !info.IsDir() {
			return c.SendFile(targetFile)
		}
		return c.SendFile(filepath.Join(distPath, "index.html"))
	})
}

// SetupStaticFS configures static asset serving and SPA fallback using an in-memory or embedded fs.FS.
func (s *Server) SetupStaticFS(distFS fs.FS) {
	s.app.Use("/", static.New("", static.Config{
		FS:         distFS,
		IndexNames: []string{"index.html"},
	}))
	s.app.Get("/*", func(c fiber.Ctx) error {
		p := c.Path()
		if strings.HasPrefix(p, "/api") || strings.HasPrefix(p, "/health") || strings.HasPrefix(p, "/docs") || strings.HasPrefix(p, "/openapi") {
			return c.Next()
		}
		indexData, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			return c.Status(fiber.StatusNotFound).SendString("Frontend build not found")
		}
		c.Set("Content-Type", "text/html; charset=utf-8")
		return c.Status(fiber.StatusOK).Send(indexData)
	})
}

func (s *Server) registerOperations() {
	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "health-check",
		Method:      http.MethodGet,
		Path:        "/health",
		Summary:     "Health check",
		Description: "Check the health and readiness of the API service",
		Tags:        []string{"system"},
	}, s.handleHealth)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-worker-status",
		Method:      http.MethodGet,
		Path:        "/api/v1/status",
		Summary:     "Get worker status",
		Description: "Get background worker synchronization status and work hours info",
		Tags:        []string{"worker"},
	}, s.handleStatus)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "trigger-sync",
		Method:      http.MethodPost,
		Path:        "/api/v1/sync",
		Summary:     "Trigger manual sync",
		Description: "Trigger an immediate synchronization from remote data source into local storage (force=true)",
		Tags:        []string{"worker"},
	}, s.handleSync)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-orders",
		Method:      http.MethodGet,
		Path:        "/api/v1/orders",
		Summary:     "List orders",
		Description: "List orders with pagination and filters (customer, date, area, order_number, ecatalog_number)",
		Tags:        []string{"orders"},
	}, s.handleListOrders)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-order-by-id",
		Method:      http.MethodGet,
		Path:        "/api/v1/orders/{id}",
		Summary:     "Get order by ID",
		Description: "Get a single order by its ID with all line items",
		Tags:        []string{"orders"},
	}, s.handleGetOrderByID)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-items",
		Method:      http.MethodGet,
		Path:        "/api/v1/items",
		Summary:     "List items",
		Description: "List normalized line items with pagination and filters (customer, nama_barang, status_order, date, order_number, ecatalog_number)",
		Tags:        []string{"items"},
	}, s.handleListItems)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-deliveries",
		Method:      http.MethodGet,
		Path:        "/api/v1/deliveries",
		Summary:     "List delivery shipments",
		Description: "Timeline shipment feed returning individual delivery shipments joined to source items",
		Tags:        []string{"deliveries"},
	}, s.handleListDeliveries)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-stats",
		Method:      http.MethodGet,
		Path:        "/api/v1/stats",
		Summary:     "Get stats",
		Description: "Get aggregated summary statistics of orders and items",
		Tags:        []string{"stats"},
	}, s.handleGetStats)
	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-sync-history",
		Method:      http.MethodGet,
		Path:        "/api/v1/sync/history",
		Summary:     "List sync history",
		Description: "List historical background worker sync records with pagination",
		Tags:        []string{"worker"},
	}, s.handleListSyncHistory)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-customers",
		Method:      http.MethodGet,
		Path:        "/api/v1/customers",
		Summary:     "List customers",
		Description: "List aggregated customer summaries with status breakdowns and pagination",
		Tags:        []string{"customers"},
	}, s.handleListCustomers)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "list-areas",
		Method:      http.MethodGet,
		Path:        "/api/v1/areas",
		Summary:     "List areas",
		Description: "List regional area summaries with order and status breakdowns",
		Tags:        []string{"areas"},
	}, s.handleListAreas)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "search",
		Method:      http.MethodGet,
		Path:        "/api/v1/search",
		Summary:     "Global search",
		Description: "Search across orders, line items, and customers",
		Tags:        []string{"search"},
	}, s.handleSearch)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-config",
		Method:      http.MethodGet,
		Path:        "/api/v1/config",
		Summary:     "Get system configuration",
		Description: "Get worker scheduling, timezone, and spreadsheet configuration parameters",
		Tags:        []string{"system"},
	}, s.handleConfig)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-system-info",
		Method:      http.MethodGet,
		Path:        "/api/v1/system",
		Summary:     "Get system diagnostics",
		Description: "Get runtime stats, uptime, port, db path, and SQLite table metrics",
		Tags:        []string{"system"},
	}, s.handleSystem)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-customer-aliases",
		Method:      http.MethodGet,
		Path:        "/api/v1/customer-aliases",
		Summary:     "Get customer aliases",
		Description: "Get customer name aliases grouped by canonical customer name",
		Tags:        []string{"customers"},
	}, s.handleGetCustomerAliases)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "set-customer-alias",
		Method:      http.MethodPut,
		Path:        "/api/v1/customer-aliases",
		Summary:     "Set customer alias",
		Description: "Create or update a customer name alias mapping",
		Tags:        []string{"customers"},
	}, s.handleSetCustomerAlias)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "delete-customer-alias",
		Method:      http.MethodDelete,
		Path:        "/api/v1/customer-aliases/{alias}",
		Summary:     "Delete customer alias",
		Description: "Delete a customer name alias mapping",
		Tags:        []string{"customers"},
	}, s.handleDeleteCustomerAlias)
}
