package api

import (
	"context"
	"errors"
	"fmt"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/adapter"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/session"
	"github.com/awang-karisma/warehouse-parser/pkg/auth"
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
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"
)

type contextKey string

const authClaimsKey contextKey = "auth_claims"

func claimsFromContext(ctx context.Context) *auth.Claims {
	if ctx == nil {
		return nil
	}
	if claims, ok := ctx.Value(authClaimsKey).(*auth.Claims); ok {
		return claims
	}
	return nil
}

func roleLevel(role string) int {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "superadmin":
		return 4
	case "admin":
		return 3
	case "user":
		return 2
	case "guest":
		return 1
	default:
		return 0
	}
}

func hasMinRole(userRole, minRole string) bool {
	return roleLevel(userRole) >= roleLevel(minRole)
}

// requireRole validates that the request has at least minRole permissions.
// If auth is disabled (claims is nil), returns nil (allow).
func requireRole(c fiber.Ctx, minRole string) error {
	claims, ok := c.Locals("user").(*auth.Claims)
	if !ok || claims == nil {
		return nil
	}
	if !hasMinRole(claims.Role, minRole) {
		return fiber.NewError(fiber.StatusForbidden, "insufficient permissions")
	}
	return nil
}

// requireRole validates that the request has at least minRole permissions.
func (s *Server) requireRole(c fiber.Ctx, minRole string) error {
	if s.appConfig == nil || s.appConfig.GoogleClientID == "" {
		return nil
	}
	claims, ok := c.Locals("user").(*auth.Claims)
	if !ok || claims == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "authentication required")
	}
	if !hasMinRole(claims.Role, minRole) {
		return fiber.NewError(fiber.StatusForbidden, "insufficient permissions")
	}
	return nil
}

// Config holds dependencies for creating an API Server.
type Config struct {
	Store            *storage.Storage
	Worker           *worker.Worker
	AppConfig        *config.Config
	AccurateProvider accurate.Provider
	AccurateSession  *session.Manager
	AccurateRegistry *adapter.Registry
}

// Server wraps the Fiber v3 HTTP application and Huma v2 API.
type Server struct {
	app              *fiber.App
	humaAPI          huma.API
	store            *storage.Storage
	worker           *worker.Worker
	appConfig        *config.Config
	accurateProvider accurate.Provider
	accurateSession  *session.Manager
	accurateRegistry *adapter.Registry
	startTime        time.Time
}

// New creates and initializes a new Fiber v3 API Server with middlewares and routes.
func New(cfg Config) *Server {
	app := fiber.New(fiber.Config{
		AppName:   "Warehouse Order Tracking API",
		BodyLimit: 10 * 1024 * 1024,
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	// Middlewares
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New())

	humaCfg := huma.DefaultConfig("Warehouse Order Tracking API", version.Version)
	humaCfg.DocsRenderer = huma.DocsRendererScalar
	humaCfg.DocsPath = "/docs"
	humaCfg.OpenAPIPath = "/openapi"
	humaCfg.Components.Schemas = huma.NewMapRegistry("#/components/schemas/", func(t reflect.Type, hint string) string {
		name := huma.DefaultSchemaNamer(t, hint)
		elem := t
		for elem != nil && (elem.Kind() == reflect.Ptr || elem.Kind() == reflect.Slice || elem.Kind() == reflect.Array) {
			elem = elem.Elem()
		}
		if elem != nil && strings.Contains(elem.PkgPath(), "pkg/accurate") && !strings.HasPrefix(name, "Accurate") {
			return "Accurate" + name
		}
		return name
	})
	humaAPI := humafiber.New(app, humaCfg)

	s := &Server{
		app:              app,
		humaAPI:          humaAPI,
		store:            cfg.Store,
		worker:           cfg.Worker,
		appConfig:        cfg.AppConfig,
		startTime:        time.Now(),
		accurateProvider: cfg.AccurateProvider,
		accurateSession:  cfg.AccurateSession,
		accurateRegistry: cfg.AccurateRegistry,
	}
	app.Use(s.authMiddleware)
	humaAPI.UseMiddleware(s.humaAuthMiddleware)

	s.registerOperations()
	// Raw Fiber routes
	app.Get("/api/v1/items/export", s.handleExportItems)
	app.Get("/api/v1/sync/events", s.handleSyncSSE)
	app.Get("/api/v1/customer-aliases/export", s.handleExportCustomerAliases)
	app.Post("/api/v1/customer-aliases/import", s.handleImportCustomerAliases)

	// Auth routes (raw Fiber routes)
	app.Get("/auth/config", s.handleAuthConfig)
	app.Post("/auth/google/callback", s.handleGoogleCallback)
	app.Get("/auth/me", s.handleAuthMe)
	app.Post("/auth/logout", s.handleLogout)

	// Admin routes (raw Fiber routes)
	app.Get("/api/v1/admin/users", s.handleListUsers)
	app.Put("/api/v1/admin/users/:email/role", s.handleSetUserRole)
	app.Delete("/api/v1/admin/users/:email", s.handleDeleteUser)
	app.Post("/api/v1/admin/clear-database", s.handleClearDatabase)
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
	s.app.Use("/assets", static.New(filepath.Join(distPath, "assets"), static.Config{
		ModifyResponse: func(c fiber.Ctx) error {
			c.Set("Cache-Control", "public, max-age=31536000, immutable")
			return nil
		},
	}))
	s.app.Get("/*", func(c fiber.Ctx) error {
		p := c.Path()
		if strings.HasPrefix(p, "/api") || strings.HasPrefix(p, "/health") || strings.HasPrefix(p, "/docs") || strings.HasPrefix(p, "/openapi") || strings.HasPrefix(p, "/auth") {
			return c.Next()
		}
		if strings.HasPrefix(p, "/assets/") || strings.HasPrefix(p, "/assets") {
			return c.Status(fiber.StatusNotFound).SendString("Asset not found")
		}
		targetFile := filepath.Join(distPath, filepath.Clean(p))
		if info, err := os.Stat(targetFile); err == nil && !info.IsDir() {
			if strings.HasSuffix(targetFile, ".html") {
				c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
				c.Set("Pragma", "no-cache")
				c.Set("Expires", "0")
			}
			return c.SendFile(targetFile)
		}
		c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
		return c.SendFile(filepath.Join(distPath, "index.html"))
	})
}

// SetupStaticFS configures static asset serving and SPA fallback using an in-memory or embedded fs.FS.
func (s *Server) SetupStaticFS(distFS fs.FS) {
	s.app.Use("/", static.New("", static.Config{
		FS:         distFS,
		IndexNames: []string{"index.html"},
		ModifyResponse: func(c fiber.Ctx) error {
			p := c.Path()
			if strings.HasPrefix(p, "/assets/") {
				c.Set("Cache-Control", "public, max-age=31536000, immutable")
			} else if p == "/" || strings.HasSuffix(p, ".html") {
				c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
				c.Set("Pragma", "no-cache")
				c.Set("Expires", "0")
			}
			return nil
		},
	}))
	s.app.Get("/*", func(c fiber.Ctx) error {
		p := c.Path()
		if strings.HasPrefix(p, "/api") || strings.HasPrefix(p, "/health") || strings.HasPrefix(p, "/docs") || strings.HasPrefix(p, "/openapi") || strings.HasPrefix(p, "/auth") {
			return c.Next()
		}
		if strings.HasPrefix(p, "/assets/") || strings.HasPrefix(p, "/assets") {
			return c.Status(fiber.StatusNotFound).SendString("Asset not found")
		}
		indexData, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			return c.Status(fiber.StatusNotFound).SendString("Frontend build not found")
		}
		c.Set("Content-Type", "text/html; charset=utf-8")
		c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
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
		Metadata:    map[string]any{"minRole": "admin"},
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
		OperationID: "get-delivery-stats",
		Method:      http.MethodGet,
		Path:        "/api/v1/deliveries/stats",
		Summary:     "Get delivery stats",
		Description: "Get aggregated delivery KPI metrics (total, completed, pending, avg lead time)",
		Tags:        []string{"deliveries"},
	}, s.handleGetDeliveryStats)

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
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleSetCustomerAlias)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "delete-customer-alias",
		Method:      http.MethodDelete,
		Path:        "/api/v1/customer-aliases/{alias}",
		Summary:     "Delete customer alias",
		Description: "Delete a customer name alias mapping",
		Tags:        []string{"customers"},
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleDeleteCustomerAlias)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-workday-policies",
		Method:      http.MethodGet,
		Path:        "/api/v1/workday-policies",
		Summary:     "Get workday policies",
		Description: "Get chronological history of effective workday schedules for lead-time calculation",
		Tags:        []string{"config"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleGetWorkdayPolicies)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "set-workday-policy",
		Method:      http.MethodPut,
		Path:        "/api/v1/workday-policies",
		Summary:     "Set workday policy",
		Description: "Set or replace active workdays effective from current local date and recalculate lead times",
		Tags:        []string{"config"},
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleSetWorkdayPolicy)

	// Custom Page Designs Endpoints
	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-page-designs",
		Method:      http.MethodGet,
		Path:        "/api/v1/page-designs",
		Summary:     "List page designs",
		Description: "Get all custom page designs for barcode label printing",
		Tags:        []string{"barcode"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleGetPageDesigns)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "create-page-design",
		Method:      http.MethodPost,
		Path:        "/api/v1/page-designs",
		Summary:     "Create page design",
		Description: "Create a new custom page design for barcode label printing",
		Tags:        []string{"barcode"},
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleCreatePageDesign)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "update-page-design",
		Method:      http.MethodPut,
		Path:        "/api/v1/page-designs/{id}",
		Summary:     "Update page design",
		Description: "Update an existing custom page design",
		Tags:        []string{"barcode"},
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleUpdatePageDesign)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "delete-page-design",
		Method:      http.MethodDelete,
		Path:        "/api/v1/page-designs/{id}",
		Summary:     "Delete page design",
		Description: "Delete a custom page design",
		Tags:        []string{"barcode"},
		Metadata:    map[string]any{"minRole": "admin"},
	}, s.handleDeletePageDesign)

	// Accurate Online Integration Endpoints
	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-accurate-status",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/status",
		Summary:     "Get Accurate Online integration status",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateStatus)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "accurate-login",
		Method:      http.MethodPost,
		Path:        "/api/v1/accurate/login",
		Summary:     "Login or submit MFA for Accurate Online",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateLogin)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "accurate-logout",
		Method:      http.MethodPost,
		Path:        "/api/v1/accurate/logout",
		Summary:     "Log out from Accurate Online session",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateLogout)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-accurate-databases",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/databases",
		Summary:     "List accessible Accurate databases",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateDatabases)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "select-accurate-database",
		Method:      http.MethodPost,
		Path:        "/api/v1/accurate/database",
		Summary:     "Select and open Accurate database",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateSelectDatabase)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "search-accurate-items",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/items",
		Summary:     "Search items from Accurate inventory",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateItems)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-accurate-sources",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/sources",
		Summary:     "List registered Accurate transaction sources",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateSources)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-accurate-source-documents",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/sources/{source}/documents",
		Summary:     "List documents for an Accurate transaction source",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateSourceDocuments)

	huma.Register(s.humaAPI, huma.Operation{
		OperationID: "get-accurate-source-document-items",
		Method:      http.MethodGet,
		Path:        "/api/v1/accurate/sources/{source}/documents/{id}/items",
		Summary:     "Get line items for an Accurate source document",
		Tags:        []string{"accurate"},
		Metadata:    map[string]any{"minRole": "user"},
	}, s.handleAccurateSourceDocumentItems)
}

// clearSessionCookie expires the warehouse_session cookie.
func clearSessionCookie(c fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     "warehouse_session",
		Value:    "",
		Path:     "/",
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		MaxAge:   -1,
		Expires:  time.Now().Add(-1 * time.Hour),
	})
}

// resolveCurrentUser looks up the user by email in the database and returns a copy of claims
// with the latest email, name, picture, and effective role.
func (s *Server) resolveCurrentUser(ctx context.Context, claims *auth.Claims) (*auth.Claims, bool, error) {
	if claims == nil {
		return nil, false, nil
	}
	if s.store == nil {
		return nil, false, errors.New("storage service not available")
	}
	user, err := s.store.GetUserByEmail(ctx, claims.Email)
	if err != nil {
		return nil, false, err
	}
	if user == nil {
		return nil, false, nil
	}

	refreshed := *claims
	refreshed.Email = user.Email
	refreshed.Name = user.Name
	refreshed.Picture = user.Picture
	refreshed.Role = user.Role

	if s.appConfig != nil && s.appConfig.IsSuperadmin(user.Email) {
		refreshed.Role = "superadmin"
	}

	return &refreshed, true, nil
}

// authMiddleware verifies the warehouse_session cookie for protected routes.
func (s *Server) authMiddleware(c fiber.Ctx) error {
	if s.appConfig == nil || s.appConfig.GoogleClientID == "" {
		return c.Next()
	}

	p := c.Path()
	if strings.HasPrefix(p, "/auth/") || p == "/auth" ||
		p == "/health" || strings.HasPrefix(p, "/health/") ||
		strings.HasPrefix(p, "/docs") ||
		strings.HasPrefix(p, "/openapi") ||
		(!strings.HasPrefix(p, "/api/") && p != "/api") {
		return c.Next()
	}

	cookie := c.Cookies("warehouse_session")
	if cookie == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	claims, err := auth.ValidateToken(s.appConfig.JWTSecret, cookie)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "storage service not available"})
	}

	refreshedClaims, found, err := s.resolveCurrentUser(c.Context(), claims)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("failed to resolve user: %v", err)})
	}
	if !found {
		clearSessionCookie(c)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	c.Locals("user", refreshedClaims)
	c.SetContext(context.WithValue(c.Context(), authClaimsKey, refreshedClaims))
	return c.Next()
}

// humaAuthMiddleware enforces minimum role authorization for Huma operations.
func (s *Server) humaAuthMiddleware(ctx huma.Context, next func(huma.Context)) {
	if s.appConfig == nil || s.appConfig.GoogleClientID == "" {
		next(ctx)
		return
	}

	op := ctx.Operation()
	if op == nil {
		next(ctx)
		return
	}

	if !strings.HasPrefix(op.Path, "/api/v1/") {
		next(ctx)
		return
	}

	minRole := "user"
	if op.Metadata != nil {
		if r, ok := op.Metadata["minRole"].(string); ok && r != "" {
			minRole = r
		}
	}

	claims := claimsFromContext(ctx.Context())
	if claims == nil {
		_ = huma.WriteErr(s.humaAPI, ctx, http.StatusUnauthorized, "authentication required")
		return
	}

	if !hasMinRole(claims.Role, minRole) {
		_ = huma.WriteErr(s.humaAPI, ctx, http.StatusForbidden, "insufficient permissions")
		return
	}

	next(ctx)
}
