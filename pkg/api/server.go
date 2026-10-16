// @title           Warehouse Order Tracking API
// @version         1.0
// @description     Read-only HTTP REST API server for warehouse order tracking data with background Google Sheets synchronization.
// @termsOfService  http://swagger.io/terms/

// @contact.name    Warehouse Engineering
// @contact.url     https://github.com/awang-karisma/warehouse-parser

// @license.name    MIT
// @license.url     https://opensource.org/licenses/MIT

// @host            localhost:8080
// @BasePath        /
package api

import (
	"github.com/awang-karisma/warehouse-parser/docs"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

// Config holds dependencies for creating an API Server.
type Config struct {
	Store  *storage.Storage
	Worker *worker.Worker
}

// Server wraps the Fiber v3 HTTP application.
type Server struct {
	app    *fiber.App
	store  *storage.Storage
	worker *worker.Worker
}

// New creates and initializes a new Fiber v3 API Server with middlewares and routes.
func New(cfg Config) *Server {
	app := fiber.New(fiber.Config{
		AppName: "Warehouse Order Tracking API",
	})

	// Middlewares
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New())

	s := &Server{
		app:    app,
		store:  cfg.Store,
		worker: cfg.Worker,
	}

	s.registerRoutes()
	return s
}

// App returns the underlying Fiber app instance.
func (s *Server) App() *fiber.App {
	return s.app
}

func (s *Server) registerRoutes() {
	// Health
	s.app.Get("/health", s.handleHealth)

	// API v1
	v1 := s.app.Group("/api/v1")
	v1.Get("/status", s.handleStatus)
	v1.Post("/sync", s.handleSync)
	v1.Get("/orders", s.handleListOrders)
	v1.Get("/orders/:id", s.handleGetOrderByID)
	v1.Get("/items", s.handleListItems)
	v1.Get("/stats", s.handleGetStats)

	// Documentation routes
	s.app.Get("/swagger/doc.json", s.handleSwaggerJSON)
	s.app.Get("/swagger", handleSwaggerUI)
	s.app.Get("/swagger/*", handleSwaggerUI)
	s.app.Get("/scalar", handleScalarUI)
	s.app.Get("/docs", handleSwaggerUI)
}

func (s *Server) handleSwaggerJSON(c fiber.Ctx) error {
	c.Set("Content-Type", "application/json; charset=utf-8")
	return c.SendString(docs.SwaggerInfo.ReadDoc())
}
