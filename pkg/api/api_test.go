package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/auth"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/gofiber/fiber/v3"
)

func setupTestServer(t *testing.T, customConfig ...*config.Config) (*api.Server, *storage.Storage, *worker.Worker) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test_api.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create test storage: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})

	sampleItems := []model.NormalizedItem{
		{
			RowIndex:           2,
			Tanggal:            model.ParseDate("02/01/2026"),
			Customer:           "RS Narmada",
			Area:               "Lombok Barat",
			NamaBarang:         "Yellowtip",
			Jumlah:             "6",
			Satuan:             "SAK",
			TanggalPengiriman:  "07/01/2026",
			LeadTimePengiriman: "5",
			JumlahTerkirim:     "6",
			BelumTerkirim:      "0",
			StatusOrder:        "SELESAI",
			StatusBarang:       "DONE",
		},
		{
			RowIndex:           3,
			OrderNumber:        "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			EcatalogNumber:     "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Tanggal:            model.ParseDate("02/01/2026"),
			Customer:           "RS Patuh Karya",
			Area:               "Lombok Tengah",
			NamaBarang:         "BC-5D Control",
			Jumlah:             "1",
			Satuan:             "SET",
			TanggalPengiriman:  "14/01/2026",
			LeadTimePengiriman: "5",
			JumlahTerkirim:     "1",
			BelumTerkirim:      "0",
			StatusOrder:        "SELESAI",
			StatusBarang:       "DONE",
		},
	}

	sampleOrders := []model.Order{
		{
			ID:       "ORD-0001",
			Tanggal:  model.ParseDate("02/01/2026"),
			Customer: "RS Narmada",
			Area:     "Lombok Barat",
			Items: []model.OrderItem{
				{
					RowIndex:           2,
					NamaBarang:         "Yellowtip",
					Jumlah:             "6",
					Satuan:             "SAK",
					TanggalPengiriman:  "07/01/2026",
					LeadTimePengiriman: "5",
					JumlahTerkirim:     "6",
					BelumTerkirim:      "0",
					StatusOrder:        "SELESAI",
					StatusBarang:       "DONE",
				},
			},
		},
		{
			ID:             "ORD-0002",
			OrderNumber:    "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			EcatalogNumber: "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
			Tanggal:        model.ParseDate("02/01/2026"),
			Customer:       "RS Patuh Karya",
			Area:           "Lombok Tengah",
			Items: []model.OrderItem{
				{
					RowIndex:           3,
					OrderNumber:        "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
					EcatalogNumber:     "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2",
					NamaBarang:         "BC-5D Control",
					Jumlah:             "1",
					Satuan:             "SET",
					TanggalPengiriman:  "14/01/2026",
					LeadTimePengiriman: "5",
					JumlahTerkirim:     "1",
					BelumTerkirim:      "0",
					StatusOrder:        "SELESAI",
					StatusBarang:       "DONE",
				},
			},
		},
	}

	// Populate initial data
	if err := store.SyncMirror(context.Background(), sampleItems, sampleOrders); err != nil {
		t.Fatalf("failed to populate test storage: %v", err)
	}

	fetcher := worker.FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
		return sampleItems, sampleOrders, nil
	})

	w, err := worker.New(worker.Config{
		Interval:       15 * time.Minute,
		WorkHoursStart: "00:00",
		WorkHoursEnd:   "23:59",
		Timezone:       "Asia/Makassar",
	}, store, fetcher)
	if err != nil {
		t.Fatalf("failed to initialize worker: %v", err)
	}

	var appCfg *config.Config
	if len(customConfig) > 0 && customConfig[0] != nil {
		appCfg = customConfig[0]
	}
	srv := api.New(api.Config{
		Store:     store,
		Worker:    w,
		AppConfig: appCfg,
	})

	return srv, store, w
}

func TestHealthEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("GET", "/health", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode json body: %v", err)
	}

	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", body["status"])
	}
}

func TestStatusEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("GET", "/api/v1/status", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var statusResp api.StatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&statusResp); err != nil {
		t.Fatalf("failed to decode status response: %v", err)
	}

	if statusResp.Status == "" {
		t.Errorf("expected non-empty status")
	}
	if statusResp.LastRecord == nil {
		t.Errorf("expected non-nil last sync record")
	}
}

func TestSyncEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("POST", "/api/v1/sync", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var syncResp api.SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("failed to decode sync response: %v", err)
	}

	if syncResp.Status != "ok" {
		t.Errorf("expected status=ok, got %s", syncResp.Status)
	}
	if syncResp.Record == nil {
		t.Errorf("expected non-nil record")
	}
}

func TestOrdersEndpoints(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	t.Run("list orders all", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var ordersResp api.OrdersResponse
		if err := json.NewDecoder(resp.Body).Decode(&ordersResp); err != nil {
			t.Fatalf("failed to decode orders response: %v", err)
		}

		if ordersResp.Total != 2 {
			t.Errorf("expected Total=2, got %d", ordersResp.Total)
		}
		if len(ordersResp.Orders) != 2 {
			t.Errorf("expected 2 orders, got %d", len(ordersResp.Orders))
		}
	})

	t.Run("filter orders by customer", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders?customer=Narmada", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var ordersResp api.OrdersResponse
		if err := json.NewDecoder(resp.Body).Decode(&ordersResp); err != nil {
			t.Fatalf("failed to decode orders response: %v", err)
		}

		if ordersResp.Total != 1 {
			t.Errorf("expected Total=1, got %d", ordersResp.Total)
		}
		if ordersResp.Orders[0].Customer != "RS Narmada" {
			t.Errorf("expected customer RS Narmada, got %s", ordersResp.Orders[0].Customer)
		}
	})

	t.Run("filter orders by order_number", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders?order_number=EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var ordersResp api.OrdersResponse
		if err := json.NewDecoder(resp.Body).Decode(&ordersResp); err != nil {
			t.Fatalf("failed to decode orders response: %v", err)
		}

		if ordersResp.Total != 1 {
			t.Fatalf("expected Total=1, got %d", ordersResp.Total)
		}
		if ordersResp.Orders[0].ID != "ORD-0002" {
			t.Errorf("expected ORD-0002, got %s", ordersResp.Orders[0].ID)
		}
		if ordersResp.Orders[0].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
			t.Errorf("expected order_number EP-01KPSBM6ANVBV1MMJ2G8QYDDD2, got %s", ordersResp.Orders[0].OrderNumber)
		}
		if ordersResp.Orders[0].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
			t.Errorf("expected ecatalog_number EP-01KPSBM6ANVBV1MMJ2G8QYDDD2, got %s", ordersResp.Orders[0].EcatalogNumber)
		}
	})

	t.Run("filter orders by ecatalog_number", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders?ecatalog_number=EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var ordersResp api.OrdersResponse
		if err := json.NewDecoder(resp.Body).Decode(&ordersResp); err != nil {
			t.Fatalf("failed to decode orders response: %v", err)
		}

		if ordersResp.Total != 1 {
			t.Fatalf("expected Total=1, got %d", ordersResp.Total)
		}
		if ordersResp.Orders[0].ID != "ORD-0002" {
			t.Errorf("expected ORD-0002, got %s", ordersResp.Orders[0].ID)
		}
	})

	t.Run("get order by ID found", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders/ORD-0001", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var ord model.Order
		if err := json.NewDecoder(resp.Body).Decode(&ord); err != nil {
			t.Fatalf("failed to decode order: %v", err)
		}

		if ord.ID != "ORD-0001" {
			t.Errorf("expected ID ORD-0001, got %s", ord.ID)
		}
		if len(ord.Items) != 1 {
			t.Errorf("expected 1 line item, got %d", len(ord.Items))
		}
		if ord.Items[0].NamaBarang != "Yellowtip" {
			t.Errorf("expected item Yellowtip, got %s", ord.Items[0].NamaBarang)
		}
	})

	t.Run("get order by ID not found", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders/ORD-9999", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("expected status 404, got %d", resp.StatusCode)
		}
	})
}

func TestItemsEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	t.Run("list all items", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var itemsResp api.ItemsResponse
		if err := json.NewDecoder(resp.Body).Decode(&itemsResp); err != nil {
			t.Fatalf("failed to decode items response: %v", err)
		}

		if itemsResp.Total != 2 {
			t.Errorf("expected Total=2, got %d", itemsResp.Total)
		}
		if len(itemsResp.Items) != 2 {
			t.Errorf("expected 2 items, got %d", len(itemsResp.Items))
		}
	})

	t.Run("filter items by nama_barang", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items?nama_barang=Yellowtip", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var itemsResp api.ItemsResponse
		if err := json.NewDecoder(resp.Body).Decode(&itemsResp); err != nil {
			t.Fatalf("failed to decode items response: %v", err)
		}

		if itemsResp.Total != 1 {
			t.Errorf("expected Total=1, got %d", itemsResp.Total)
		}
		if itemsResp.Items[0].NamaBarang != "Yellowtip" {
			t.Errorf("expected NamaBarang Yellowtip, got %s", itemsResp.Items[0].NamaBarang)
		}
	})

	t.Run("filter items by order_number", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items?order_number=EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var itemsResp api.ItemsResponse
		if err := json.NewDecoder(resp.Body).Decode(&itemsResp); err != nil {
			t.Fatalf("failed to decode items response: %v", err)
		}

		if itemsResp.Total != 1 {
			t.Fatalf("expected Total=1, got %d", itemsResp.Total)
		}
		if itemsResp.Items[0].NamaBarang != "BC-5D Control" {
			t.Errorf("expected NamaBarang BC-5D Control, got %s", itemsResp.Items[0].NamaBarang)
		}
		if itemsResp.Items[0].OrderNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
			t.Errorf("expected OrderNumber EP-01KPSBM6ANVBV1MMJ2G8QYDDD2, got %s", itemsResp.Items[0].OrderNumber)
		}
		if itemsResp.Items[0].EcatalogNumber != "EP-01KPSBM6ANVBV1MMJ2G8QYDDD2" {
			t.Errorf("expected EcatalogNumber EP-01KPSBM6ANVBV1MMJ2G8QYDDD2, got %s", itemsResp.Items[0].EcatalogNumber)
		}
	})

	t.Run("filter items by ecatalog_number", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items?ecatalog_number=EP-01KPSBM6ANVBV1MMJ2G8QYDDD2", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var itemsResp api.ItemsResponse
		if err := json.NewDecoder(resp.Body).Decode(&itemsResp); err != nil {
			t.Fatalf("failed to decode items response: %v", err)
		}

		if itemsResp.Total != 1 {
			t.Fatalf("expected Total=1, got %d", itemsResp.Total)
		}
		if itemsResp.Items[0].NamaBarang != "BC-5D Control" {
			t.Errorf("expected NamaBarang BC-5D Control, got %s", itemsResp.Items[0].NamaBarang)
		}
	})
}

func TestStatsEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("GET", "/api/v1/stats", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var stats storage.Stats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		t.Fatalf("failed to decode stats: %v", err)
	}

	if stats.TotalOrders != 2 {
		t.Errorf("expected TotalOrders=2, got %d", stats.TotalOrders)
	}
	if stats.TotalItems != 2 {
		t.Errorf("expected TotalItems=2, got %d", stats.TotalItems)
	}
	if stats.UniqueCustomers != 2 {
		t.Errorf("expected UniqueCustomers=2, got %d", stats.UniqueCustomers)
	}
	if stats.UniqueAreas != 2 {
		t.Errorf("expected UniqueAreas=2, got %d", stats.UniqueAreas)
	}
}

func TestDocumentationRoutes(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	t.Run("openapi json doc", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/openapi.json", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "application/json") && !strings.Contains(ct, "application/vnd.oai.openapi+json") && !strings.Contains(ct, "application/openapi+json") {
			t.Errorf("expected application/json or application/vnd.oai.openapi+json Content-Type, got %s", ct)
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(bodyBytes), "Warehouse Order Tracking API") {
			t.Errorf("expected openapi json to mention API title, got: %s", string(bodyBytes))
		}
	})

	t.Run("scalar docs html", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/docs", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "text/html") {
			t.Errorf("expected text/html Content-Type, got %s", ct)
		}
	})
}

func TestNewEndpoints(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	t.Run("GET /api/v1/sync/history", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/sync/history?limit=5", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Total   int   `json:"total"`
			Records []any `json:"records"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Total < 1 {
			t.Errorf("expected at least 1 sync history record, got %d", data.Total)
		}
	})

	t.Run("GET /api/v1/customers", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/customers?limit=10", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Total     int `json:"total"`
			Customers []struct {
				Name string `json:"name"`
				Area string `json:"area"`
			} `json:"customers"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Total != 2 {
			t.Errorf("expected 2 customers, got %d", data.Total)
		}
	})

	t.Run("GET /api/v1/areas", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/areas", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Total int `json:"total"`
			Areas []struct {
				Name string `json:"name"`
			} `json:"areas"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Total != 2 {
			t.Errorf("expected 2 areas, got %d", data.Total)
		}
	})

	t.Run("GET /api/v1/search", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/search?q=Yellowtip", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Query string `json:"query"`
			Items struct {
				Total int `json:"total"`
			} `json:"items"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Items.Total < 1 {
			t.Errorf("expected at least 1 item matching Yellowtip, got %d", data.Items.Total)
		}
	})

	t.Run("GET /api/v1/config", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/config", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			SyncInterval string   `json:"sync_interval"`
			WorkDays     []string `json:"work_days"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if len(data.WorkDays) == 0 {
			t.Errorf("expected non-empty work days")
		}
	})

	t.Run("GET /api/v1/system", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/system", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Version string `json:"version"`
			Port    string `json:"port"`
			Tables  map[string]struct {
				RowCount int `json:"row_count"`
			} `json:"tables"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Version != "v1.0.0" {
			t.Errorf("expected version v1.0.0, got %s", data.Version)
		}
		if data.Tables["orders"].RowCount != 2 {
			t.Errorf("expected 2 orders in tables, got %d", data.Tables["orders"].RowCount)
		}
	})

	t.Run("GET /api/v1/orders with status filter", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders?status=SELESAI", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var data struct {
			Total int `json:"total"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Total != 2 {
			t.Errorf("expected 2 orders with SELESAI, got %d", data.Total)
		}
	})

	t.Run("GET /api/v1/items/export CSV", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items/export?format=csv", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "text/csv") {
			t.Errorf("expected text/csv Content-Type, got %s", ct)
		}
		body, _ := io.ReadAll(resp.Body)
		lines := strings.Split(strings.TrimSpace(string(body)), "\n")
		if len(lines) < 3 {
			t.Errorf("expected at least 3 lines (1 header + 2 items), got %d", len(lines))
		}
		if !strings.Contains(lines[0], "Nama Barang") {
			t.Errorf("expected header to contain 'Nama Barang', got %s", lines[0])
		}
	})

	t.Run("GET /api/v1/sync/events", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, "GET", "/api/v1/sync/events", nil)
		resp, err := srv.App().Test(req, fiber.TestConfig{Timeout: 500 * time.Millisecond})
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "text/event-stream") {
			t.Errorf("expected text/event-stream Content-Type, got %s", ct)
		}
	})
}

func TestSetupStaticFiles(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	tempDist := t.TempDir()
	indexFile := filepath.Join(tempDist, "index.html")
	_ = os.WriteFile(indexFile, []byte("<html><body>SolidJS App</body></html>"), 0644)

	assetsDir := filepath.Join(tempDist, "assets")
	_ = os.MkdirAll(assetsDir, 0755)
	jsFile := filepath.Join(assetsDir, "bundle.js")
	_ = os.WriteFile(jsFile, []byte("console.log('bundle');"), 0644)

	srv.SetupStaticFiles(tempDist)

	t.Run("GET / serves index.html", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), "SolidJS App") {
			t.Errorf("expected index.html content, got %s", string(body))
		}
	})

	t.Run("GET /orders/ORD-0001 SPA fallback serves index.html", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/orders/ORD-0001", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), "SolidJS App") {
			t.Errorf("expected index.html content, got %s", string(body))
		}
	})

	t.Run("GET /assets/bundle.js serves asset file", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/assets/bundle.js", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), "bundle") {
			t.Errorf("expected bundle content, got %s", string(body))
		}
	})
}

func TestCustomerAliasesAPI(t *testing.T) {
	srv, store, _ := setupTestServer(t)

	// 1. Initially empty groups
	t.Run("GET /api/v1/customer-aliases initially empty", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/customer-aliases", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var res struct {
			Groups []storage.CustomerAliasGroup `json:"groups"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if len(res.Groups) != 0 {
			t.Errorf("expected 0 groups, got %d", len(res.Groups))
		}
	})

	// 2. Validation errors on PUT
	t.Run("PUT /api/v1/customer-aliases validation", func(t *testing.T) {
		// empty alias
		req, _ := http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(`{"alias":"","canonical":"RS PKU"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := srv.App().Test(req)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for empty alias, got %d", resp.StatusCode)
		}

		// alias == canonical
		// exact alias == canonical
		req, _ = http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(`{"alias":"RS PKU","canonical":"RS PKU"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, _ = srv.App().Test(req)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for identical alias and canonical, got %d", resp.StatusCode)
		}

		// case-only alias is valid
		req, _ = http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(`{"alias":"RSUD NARMADA","canonical":"RSUD Narmada"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, _ = srv.App().Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for case-only alias, got %d", resp.StatusCode)
		}
	})

	// 3. Successfully add aliases with linked area
	t.Run("PUT /api/v1/customer-aliases success", func(t *testing.T) {
		body1 := `{"alias":"PKU Muhammadiyah Hospital","canonical":"RS PKU Muhammadiyah","area":"Lombok Barat"}`
		req1, _ := http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(body1))
		req1.Header.Set("Content-Type", "application/json")
		resp1, err := srv.App().Test(req1)
		if err != nil || resp1.StatusCode != http.StatusOK {
			t.Fatalf("failed to add alias 1: status=%d err=%v", resp1.StatusCode, err)
		}

		body2 := `{"alias":"PKU Muhammadiyah","canonical":"RS PKU Muhammadiyah","area":"Lombok Barat"}`
		req2, _ := http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(body2))
		req2.Header.Set("Content-Type", "application/json")
		resp2, err := srv.App().Test(req2)
		if err != nil || resp2.StatusCode != http.StatusOK {
			t.Fatalf("failed to add alias 2: status=%d err=%v", resp2.StatusCode, err)
		}
	})

	// 4. GET /api/v1/customer-aliases returns grouped alias with area
	t.Run("GET /api/v1/customer-aliases grouped response", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/customer-aliases", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("failed to get customer aliases: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()
		var res struct {
			Groups []storage.CustomerAliasGroup `json:"groups"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("decode failed: %v", err)
		}
		if len(res.Groups) != 2 {
			t.Fatalf("expected 2 groups, got %d", len(res.Groups))
		}
		var grp *storage.CustomerAliasGroup
		for i := range res.Groups {
			if res.Groups[i].Canonical == "RS PKU Muhammadiyah" {
				grp = &res.Groups[i]
				break
			}
		}
		if grp == nil || grp.Area != "Lombok Barat" || len(grp.Aliases) != 2 {
			t.Errorf("unexpected PKU group content: %+v", grp)
		}
	})

	// 5. Test Worker sync with alias canonicalization and linked area
	t.Run("Worker Sync applies customer aliases and linked area", func(t *testing.T) {
		sourceItems := []model.NormalizedItem{
			{
				RowIndex:    2,
				Tanggal:     model.ParseDate("05/01/2026"),
				Customer:    "PKU Muhammadiyah",
				NamaBarang:  "Item 1",
				Jumlah:      "5",
				StatusOrder: "SELESAI",
			},
			{
				RowIndex:    3,
				Tanggal:     model.ParseDate("05/01/2026"),
				Customer:    "PKU Muhammadiyah Hospital",
				NamaBarang:  "Item 2",
				Jumlah:      "3",
				StatusOrder: "SELESAI",
			},
		}

		mockFetcher := worker.FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
			itemsCopy := make([]model.NormalizedItem, len(sourceItems))
			copy(itemsCopy, sourceItems)
			for i := range itemsCopy {
				key := strings.ToLower(strings.TrimSpace(itemsCopy[i].Customer))
				if mapping, ok := aliases[key]; ok {
					if mapping.Canonical != "" {
						itemsCopy[i].Customer = mapping.Canonical
					}
					if mapping.Area != "" {
						itemsCopy[i].Area = mapping.Area
					}
				}
			}
			orders := []model.Order{
				{
					ID:       "ORD-CANONICAL-1",
					Tanggal:  model.ParseDate("05/01/2026"),
					Customer: itemsCopy[0].Customer,
					Area:     itemsCopy[0].Area,
					Items: []model.OrderItem{
						{RowIndex: 2, NamaBarang: "Item 1", Jumlah: "5", StatusOrder: "SELESAI"},
						{RowIndex: 3, NamaBarang: "Item 2", Jumlah: "3", StatusOrder: "SELESAI"},
					},
				},
			}
			return itemsCopy, orders, nil
		})

		w, err := worker.New(worker.Config{
			Interval:       15 * time.Minute,
			WorkHoursStart: "00:00",
			WorkHoursEnd:   "23:59",
			Timezone:       "Asia/Makassar",
		}, store, mockFetcher)
		if err != nil {
			t.Fatalf("failed to create worker: %v", err)
		}

		if err := w.RunOnce(context.Background(), true); err != nil {
			t.Fatalf("RunOnce failed: %v", err)
		}

		// Verify stored customer is canonical and area is Lombok Barat
		orders, total, err := store.GetOrders(context.Background(), storage.OrderFilter{})
		if err != nil || total != 1 {
			t.Fatalf("expected 1 order, got total=%d err=%v", total, err)
		}
		if orders[0].Customer != "RS PKU Muhammadiyah" || orders[0].Area != "Lombok Barat" {
			t.Errorf("expected canonical customer and Lombok Barat, got customer=%q area=%q", orders[0].Customer, orders[0].Area)
		}

		// Query orders by alias variant
		filterOrders, filterTotal, err := store.GetOrders(context.Background(), storage.OrderFilter{Customer: "PKU Muhammadiyah Hospital"})
		if err != nil || filterTotal != 1 {
			t.Errorf("expected query by alias to find canonical order, got total=%d err=%v", filterTotal, err)
		} else if filterOrders[0].Customer != "RS PKU Muhammadiyah" {
			t.Errorf("expected returned customer name to be canonical, got %s", filterOrders[0].Customer)
		}
	})

	// 6. DELETE /api/v1/customer-aliases/{alias}
	t.Run("DELETE /api/v1/customer-aliases/{alias}", func(t *testing.T) {
		req, _ := http.NewRequest("DELETE", "/api/v1/customer-aliases/PKU%20Muhammadiyah%20Hospital", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("delete failed: status=%d err=%v", resp.StatusCode, err)
		}

		// Verify 1 alias remains in group
		getReq, _ := http.NewRequest("GET", "/api/v1/customer-aliases", nil)
		getResp, _ := srv.App().Test(getReq)
		var res struct {
			Groups []storage.CustomerAliasGroup `json:"groups"`
		}
		_ = json.NewDecoder(getResp.Body).Decode(&res)
		if len(res.Groups) != 2 {
			t.Errorf("expected 2 alias groups after delete, got %+v", res.Groups)
		}
		for _, group := range res.Groups {
			if group.Canonical == "RS PKU Muhammadiyah" && (len(group.Aliases) != 1 || group.Aliases[0] != "PKU Muhammadiyah") {
				t.Errorf("expected PKU group to retain one alias, got %+v", group)
			}
		}
	})

}
func TestCustomerAliasAPIImmediatelyAggregatesExistingRows(t *testing.T) {
	srv, store, _ := setupTestServer(t)
	ctx := context.Background()
	items := []model.NormalizedItem{
		{RowIndex: 1, Customer: "RSUD NARMADA", NamaBarang: "Item 1", StatusOrder: "SELESAI"},
		{RowIndex: 2, Customer: "RSUD Narmada", Area: "Lombok Barat", NamaBarang: "Item 2", StatusOrder: "PENDING"},
	}
	orders := []model.Order{
		{ID: "alias-order", Customer: "RSUD NARMADA", Items: []model.OrderItem{{RowIndex: 1}}},
		{ID: "canonical-order", Customer: "RSUD Narmada", Area: "Lombok Barat", Items: []model.OrderItem{{RowIndex: 2}}},
	}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	putReq, _ := http.NewRequest("PUT", "/api/v1/customer-aliases", strings.NewReader(`{"alias":"RSUD NARMADA","canonical":"RSUD Narmada"}`))
	putReq.Header.Set("Content-Type", "application/json")
	putResp, err := srv.App().Test(putReq)
	if err != nil || putResp.StatusCode != http.StatusOK {
		t.Fatalf("setting case-only alias failed: status=%d err=%v", putResp.StatusCode, err)
	}

	customerReq, _ := http.NewRequest("GET", "/api/v1/customers?limit=10", nil)
	customerResp, err := srv.App().Test(customerReq)
	if err != nil || customerResp.StatusCode != http.StatusOK {
		t.Fatalf("listing customers failed: status=%d err=%v", customerResp.StatusCode, err)
	}
	var customers api.CustomersResponse
	if err := json.NewDecoder(customerResp.Body).Decode(&customers); err != nil {
		t.Fatalf("decoding customers failed: %v", err)
	}
	customerResp.Body.Close()
	if customers.Total != 1 || len(customers.Customers) != 1 || customers.Customers[0].Name != "RSUD Narmada" || customers.Customers[0].TotalOrders != 2 || customers.Customers[0].TotalItems != 2 {
		t.Fatalf("expected one aggregated canonical customer, got %+v", customers)
	}

	areaCustomersReq, _ := http.NewRequest("GET", "/api/v1/customers?area=Lombok%20Barat&limit=5", nil)
	areaCustomersResp, err := srv.App().Test(areaCustomersReq)
	if err != nil || areaCustomersResp.StatusCode != http.StatusOK {
		t.Fatalf("listing area customers failed: status=%d err=%v", areaCustomersResp.StatusCode, err)
	}
	var areaCustomers api.CustomersResponse
	if err := json.NewDecoder(areaCustomersResp.Body).Decode(&areaCustomers); err != nil {
		t.Fatalf("decoding area customers failed: %v", err)
	}
	areaCustomersResp.Body.Close()
	if areaCustomers.Total != 1 || len(areaCustomers.Customers) != 1 || areaCustomers.Customers[0].Name != "RSUD Narmada" || areaCustomers.Customers[0].TotalOrders != 2 {
		t.Fatalf("expected area customer aggregation under canonical name, got %+v", areaCustomers)
	}

	ordersReq, _ := http.NewRequest("GET", "/api/v1/orders?customer=RSUD%20NARMADA", nil)
	ordersResp, err := srv.App().Test(ordersReq)
	if err != nil || ordersResp.StatusCode != http.StatusOK {
		t.Fatalf("searching orders by alias failed: status=%d err=%v", ordersResp.StatusCode, err)
	}
	var ordersResult api.OrdersResponse
	if err := json.NewDecoder(ordersResp.Body).Decode(&ordersResult); err != nil {
		t.Fatalf("decoding orders failed: %v", err)
	}
	ordersResp.Body.Close()
	if ordersResult.Total != 2 || len(ordersResult.Orders) != 2 {
		t.Fatalf("expected alias search to return both orders, got %+v", ordersResult)
	}
	for _, order := range ordersResult.Orders {
		if order.Customer != "RSUD Narmada" {
			t.Errorf("expected canonical customer name in order response, got %q", order.Customer)
		}
	}

	searchReq, _ := http.NewRequest("GET", "/api/v1/search?q=RSUD%20NARMADA", nil)
	searchResp, err := srv.App().Test(searchReq)
	if err != nil || searchResp.StatusCode != http.StatusOK {
		t.Fatalf("searching by alias failed: status=%d err=%v", searchResp.StatusCode, err)
	}
	var searchResult struct {
		Customers struct {
			Total int `json:"total"`
		} `json:"customers"`
	}
	if err := json.NewDecoder(searchResp.Body).Decode(&searchResult); err != nil {
		t.Fatalf("decoding search results failed: %v", err)
	}
	searchResp.Body.Close()
	if searchResult.Customers.Total != 1 {
		t.Errorf("expected alias search to find canonical customer, got %+v", searchResult)
	}
}

func TestDeliveriesAPI(t *testing.T) {
	srv, store, _ := setupTestServer(t)

	// Populate item with multiple delivery pairs: "07/01/2026 (3), 03/02/2026 (1)"
	splitItem := model.NormalizedItem{
		RowIndex:          10,
		Tanggal:           model.ParseDate("02/01/2026"),
		Customer:          "RSUD Provinsi NTB",
		Area:              "Mataram",
		NamaBarang:        "Needle 23G",
		Jumlah:            "4",
		Satuan:            "BOX",
		TanggalPengiriman: "07/01/2026 (3), 03/02/2026 (1)",
		JumlahTerkirim:    "4",
		BelumTerkirim:     "0",
		StatusOrder:       "SELESAI",
	}
	plainItem := model.NormalizedItem{
		RowIndex:          11,
		Tanggal:           model.ParseDate("02/01/2026"),
		Customer:          "RSUD Provinsi NTB",
		Area:              "Mataram",
		NamaBarang:        "Spuit 3cc",
		Jumlah:            "10",
		Satuan:            "BOX",
		TanggalPengiriman: "15/01/2026",
		JumlahTerkirim:    "10",
		BelumTerkirim:     "0",
		StatusOrder:       "SELESAI",
	}
	orders := []model.Order{
		{
			ID:       "ORD-SPLIT-1",
			Tanggal:  model.ParseDate("02/01/2026"),
			Customer: "RSUD Provinsi NTB",
			Area:     "Mataram",
			Items: []model.OrderItem{
				{RowIndex: 10, NamaBarang: splitItem.NamaBarang, Jumlah: splitItem.Jumlah, TanggalPengiriman: splitItem.TanggalPengiriman},
				{RowIndex: 11, NamaBarang: plainItem.NamaBarang, Jumlah: plainItem.Jumlah, TanggalPengiriman: plainItem.TanggalPengiriman},
			},
		},
	}

	if err := store.SyncMirror(context.Background(), []model.NormalizedItem{splitItem, plainItem}, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	t.Run("GET /api/v1/deliveries lists split shipments", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/deliveries?sort=date&order=asc", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()

		var res struct {
			Total      int                    `json:"total"`
			Limit      int                    `json:"limit"`
			Offset     int                    `json:"offset"`
			Deliveries []storage.DeliveryItem `json:"deliveries"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode deliveries: %v", err)
		}

		// Total shipments should be 3 (2 from splitItem, 1 from plainItem)
		if res.Total != 3 || len(res.Deliveries) != 3 {
			t.Fatalf("expected 3 deliveries, got total=%d len=%d", res.Total, len(res.Deliveries))
		}

		// First shipment should be 07/01/2026 with quantity 3
		d0 := res.Deliveries[0]
		if d0.DeliveryDate != "2026-01-07" || d0.ShippedQuantity != "3" || d0.ShipmentIndex != 0 || d0.ShipmentCount != 2 {
			t.Errorf("unexpected d0: %+v", d0)
		}
		if d0.Item.NamaBarang != "Needle 23G" || d0.Item.Customer != "RSUD Provinsi NTB" {
			t.Errorf("unexpected d0 item: %+v", d0.Item)
		}
		if d0.Item.OrderID != "ORD-SPLIT-1" {
			t.Errorf("expected d0 item order_id ORD-SPLIT-1, got %q", d0.Item.OrderID)
		}
	})

	t.Run("GET /api/v1/deliveries filter by customer", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/deliveries?customer=RSUD%20Provinsi", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()
		var res struct {
			Total int `json:"total"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&res)
		if res.Total != 3 {
			t.Errorf("expected 3 deliveries for RSUD Provinsi, got %d", res.Total)
		}
	})
	t.Run("GET /api/v1/deliveries default sort is date DESC", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/deliveries", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()
		var res struct {
			Deliveries []storage.DeliveryItem `json:"deliveries"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&res)
		if len(res.Deliveries) != 3 {
			t.Fatalf("expected 3 deliveries, got %d", len(res.Deliveries))
		}
		if res.Deliveries[0].DeliveryDate != "2026-02-03" {
			t.Errorf("expected first delivery to be newest (2026-02-03), got %s", res.Deliveries[0].DeliveryDate)
		}
	})

	t.Run("GET /api/v1/deliveries/stats returns aggregated metrics", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/deliveries/stats", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()
		var stats storage.DeliveryStats
		if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
			t.Fatalf("failed to decode stats: %v", err)
		}
		if stats.TotalScheduled != 3 {
			t.Errorf("expected 3 total scheduled, got %d", stats.TotalScheduled)
		}
		if stats.Completed != 3 {
			t.Errorf("expected 3 completed, got %d", stats.Completed)
		}
		if stats.Pending != 0 {
			t.Errorf("expected 0 pending, got %d", stats.Pending)
		}
	})

	t.Run("GET /api/v1/items remains unchanged with raw date strings", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/items", nil)
		resp, err := srv.App().Test(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
		}
		defer resp.Body.Close()
		var res struct {
			Total int                    `json:"total"`
			Items []model.NormalizedItem `json:"items"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&res)
		if res.Total != 2 || len(res.Items) != 2 {
			t.Fatalf("expected 2 items, got total=%d len=%d", res.Total, len(res.Items))
		}
		if res.Items[0].OrderID != "ORD-SPLIT-1" {
			t.Errorf("expected item order_id ORD-SPLIT-1, got %q", res.Items[0].OrderID)
		}
		if res.Items[0].TanggalPengiriman != "07/01/2026 (3), 03/02/2026 (1)" {
			t.Errorf("items endpoint changed raw tanggal_pengiriman: %s", res.Items[0].TanggalPengiriman)
		}
	})
}
func TestOrdersAPI_StatusNormalizationHyphen(t *testing.T) {
	srv, store, _ := setupTestServer(t)

	item := model.NormalizedItem{
		RowIndex:    1,
		Tanggal:     model.ParseDate("10/01/2026"),
		Customer:    "RS Hyphen",
		Area:        "Mataram",
		NamaBarang:  "Hyphen Item",
		Jumlah:      "5",
		StatusOrder: "-",
	}
	order := model.Order{
		ID:       "ORD-HYPHEN-API",
		Tanggal:  model.ParseDate("10/01/2026"),
		Customer: "RS Hyphen",
		Area:     "Mataram",
		Items: []model.OrderItem{
			{RowIndex: 1, NamaBarang: "Hyphen Item", Jumlah: "5"},
		},
	}
	if err := store.SyncMirror(context.Background(), []model.NormalizedItem{item}, []model.Order{order}); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	req, _ := http.NewRequest("GET", "/api/v1/orders?status=BELUM%20SELESAI", nil)
	resp, err := srv.App().Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("request failed: status=%d err=%v", resp.StatusCode, err)
	}
	defer resp.Body.Close()

	var res struct {
		Total  int           `json:"total"`
		Orders []model.Order `json:"orders"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode orders: %v", err)
	}
	if res.Total != 1 || len(res.Orders) != 1 || res.Orders[0].ID != "ORD-HYPHEN-API" {
		t.Errorf("expected ORD-HYPHEN-API when querying BELUM SELESAI, got total=%d len=%d res=%+v", res.Total, len(res.Orders), res)
	}
}

func TestCustomerAliasExportImport(t *testing.T) {
	srv, store, _ := setupTestServer(t)
	ctx := context.Background()

	// Seed some aliases
	if err := store.SetCustomerAlias(ctx, "Alias One", "Canonical One", "Area One"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}
	if err := store.SetCustomerAlias(ctx, "O'Brien Clinic", "Dr. O'Brien", "West Area"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}

	t.Run("GET export returns valid SQL with headers", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/customer-aliases/export", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "application/sql") {
			t.Errorf("expected application/sql Content-Type, got %s", ct)
		}
		cd := resp.Header.Get("Content-Disposition")
		if !strings.Contains(cd, "customer-aliases.sql") {
			t.Errorf("expected Content-Disposition to contain customer-aliases.sql, got %s", cd)
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		body := string(bodyBytes)
		if !strings.Contains(body, "BEGIN TRANSACTION;") || !strings.Contains(body, "COMMIT;") {
			t.Errorf("expected transaction in SQL export, got: %s", body)
		}
		if !strings.Contains(body, "O''Brien Clinic") {
			t.Errorf("expected escaped quotes in SQL export, got: %s", body)
		}
	})

	t.Run("POST import with application/sql body merge", func(t *testing.T) {
		sqlBody := `
BEGIN TRANSACTION;
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Alias Two', 'Canonical Two', 'Area Two');
COMMIT;
`
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", strings.NewReader(sqlBody))
		req.Header.Set("Content-Type", "application/sql")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(body))
		}

		var res struct {
			Status   string   `json:"status"`
			Imported int      `json:"imported"`
			Skipped  int      `json:"skipped"`
			Errors   []string `json:"errors"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res.Status != "ok" || res.Imported != 1 || res.Skipped != 0 {
			t.Errorf("unexpected import result: %+v", res)
		}

		// Verify existing aliases are retained in merge mode
		flat, err := store.GetCustomerAliasesFlat(ctx)
		if err != nil {
			t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
		}
		if len(flat) != 3 {
			t.Errorf("expected 3 aliases after merge import, got %d", len(flat))
		}
	})

	t.Run("POST import with multipart form file replace", func(t *testing.T) {
		sqlContent := `
BEGIN TRANSACTION;
INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Replaced Alias', 'Replaced Canonical', 'Replaced Area');
COMMIT;
`
		var b bytes.Buffer
		w := multipart.NewWriter(&b)
		part, err := w.CreateFormFile("file", "backup.sql")
		if err != nil {
			t.Fatalf("CreateFormFile failed: %v", err)
		}
		if _, err := part.Write([]byte(sqlContent)); err != nil {
			t.Fatalf("write to part failed: %v", err)
		}
		w.Close()

		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=replace", &b)
		req.Header.Set("Content-Type", w.FormDataContentType())

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(body))
		}

		var res struct {
			Status   string `json:"status"`
			Imported int    `json:"imported"`
			Skipped  int    `json:"skipped"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&res)
		if res.Imported != 1 {
			t.Errorf("expected 1 imported, got %+v", res)
		}

		flat, err := store.GetCustomerAliasesFlat(ctx)
		if err != nil {
			t.Fatalf("GetCustomerAliasesFlat failed: %v", err)
		}
		if len(flat) != 1 || flat[0].Alias != "Replaced Alias" {
			t.Errorf("expected exactly 1 replaced alias, got: %+v", flat)
		}
	})

	t.Run("POST import invalid mode returns 400", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=invalid_mode", strings.NewReader("INSERT INTO customer_aliases VALUES ('a','b','c');"))
		req.Header.Set("Content-Type", "application/sql")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for invalid mode, got %d", resp.StatusCode)
		}
	})

	t.Run("POST import empty body returns 400", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", strings.NewReader("   "))
		req.Header.Set("Content-Type", "application/sql")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for empty body, got %d", resp.StatusCode)
		}
	})

	t.Run("POST import application/json returns 400", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", strings.NewReader(`[{"alias":"a","canonical":"b"}]`))
		req.Header.Set("Content-Type", "application/json")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for json content type, got %d", resp.StatusCode)
		}
	})

	t.Run("POST import non-SQL body returns 400", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", strings.NewReader("Just some random text without sql"))
		req.Header.Set("Content-Type", "text/plain")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for non-SQL body, got %d", resp.StatusCode)
		}
	})

	t.Run("POST import row with alias equal to canonical counts as skipped", func(t *testing.T) {
		sqlBody := `INSERT INTO customer_aliases (alias, canonical, area) VALUES ('Same Name', 'Same Name', '');`
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", strings.NewReader(sqlBody))
		req.Header.Set("Content-Type", "application/sql")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var res struct {
			Status   string   `json:"status"`
			Imported int      `json:"imported"`
			Skipped  int      `json:"skipped"`
			Errors   []string `json:"errors"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&res)
		if res.Imported != 0 || res.Skipped != 1 || len(res.Errors) != 1 {
			t.Errorf("expected 0 imported, 1 skipped, got %+v", res)
		}
	})

	t.Run("POST import payload too large returns 413", func(t *testing.T) {
		// Create a body > 5MB
		largeBody := make([]byte, (5<<20)+1024)
		req, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=merge", bytes.NewReader(largeBody))
		req.Header.Set("Content-Type", "application/sql")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusRequestEntityTooLarge {
			t.Errorf("expected 413 for oversized body, got %d", resp.StatusCode)
		}
	})

	t.Run("Round-trip export and import replace into fresh store", func(t *testing.T) {
		srvFresh, storeFresh, _ := setupTestServer(t)

		// 1. Export from srv
		reqExport, _ := http.NewRequest("GET", "/api/v1/customer-aliases/export", nil)
		respExport, err := srv.App().Test(reqExport)
		if err != nil || respExport.StatusCode != http.StatusOK {
			t.Fatalf("export failed: %v", err)
		}
		defer respExport.Body.Close()
		dumpData, _ := io.ReadAll(respExport.Body)

		// 2. Import replace into srvFresh
		reqImport, _ := http.NewRequest("POST", "/api/v1/customer-aliases/import?mode=replace", bytes.NewReader(dumpData))
		reqImport.Header.Set("Content-Type", "application/sql")
		respImport, err := srvFresh.App().Test(reqImport)
		if err != nil || respImport.StatusCode != http.StatusOK {
			t.Fatalf("import failed: %v", err)
		}
		defer respImport.Body.Close()

		// 3. Verify counts match
		aliasesOriginal, _ := store.GetCustomerAliasesFlat(ctx)
		aliasesFresh, _ := storeFresh.GetCustomerAliasesFlat(ctx)
		if len(aliasesOriginal) != len(aliasesFresh) {
			t.Fatalf("count mismatch: original has %d, fresh has %d", len(aliasesOriginal), len(aliasesFresh))
		}
	})
}

func TestOrdersAndItems_FilteringAndSortingAPI(t *testing.T) {
	srv, store, _ := setupTestServer(t)
	ctx := context.Background()

	customItems := []model.NormalizedItem{
		{
			RowIndex:     10,
			Tanggal:      model.ParseDate("15/01/2026"),
			Customer:     "Hospital Alpha",
			StatusOrder:  "BELUM SELESAI",
			StatusBarang: "STOK GUDANG",
			NamaBarang:   "Syringe",
		},
		{
			RowIndex:     11,
			Tanggal:      model.ParseDate("14/01/2026"),
			Customer:     "Hospital Beta",
			StatusOrder:  "PROSES",
			StatusBarang: "VENDOR TRANSIT",
			NamaBarang:   "Catheter",
		},
	}
	customOrders := []model.Order{
		{
			ID:       "ORD-ALPHA",
			Tanggal:  model.ParseDate("15/01/2026"),
			Customer: "Hospital Alpha",
			Items:    []model.OrderItem{{RowIndex: 10, StatusOrder: "BELUM SELESAI", StatusBarang: "STOK GUDANG"}},
		},
		{
			ID:       "ORD-BETA",
			Tanggal:  model.ParseDate("14/01/2026"),
			Customer: "Hospital Beta",
			Items:    []model.OrderItem{{RowIndex: 11, StatusOrder: "PROSES", StatusBarang: "VENDOR TRANSIT"}},
		},
	}
	if err := store.SyncMirror(ctx, customItems, customOrders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Test 1: GET /api/v1/orders?status=BELUM SELESAI
	req1, _ := http.NewRequest("GET", "/api/v1/orders?status=BELUM%20SELESAI", nil)
	resp1, err := srv.App().Test(req1)
	if err != nil || resp1.StatusCode != http.StatusOK {
		t.Fatalf("GET orders BELUM SELESAI failed: %v, code=%d", err, resp1.StatusCode)
	}
	var ordersBody struct {
		Total  int           `json:"total"`
		Orders []model.Order `json:"orders"`
	}
	_ = json.NewDecoder(resp1.Body).Decode(&ordersBody)
	if ordersBody.Total != 1 || len(ordersBody.Orders) != 1 || ordersBody.Orders[0].ID != "ORD-ALPHA" {
		t.Fatalf("expected 1 order ORD-ALPHA, got %d orders", ordersBody.Total)
	}

	// Test 2: GET /api/v1/items?status_barang=STOK GUDANG
	req2, _ := http.NewRequest("GET", "/api/v1/items?status_barang=STOK%20GUDANG", nil)
	resp2, err := srv.App().Test(req2)
	if err != nil || resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET items STOK GUDANG failed: %v, code=%d", err, resp2.StatusCode)
	}
	var itemsBody struct {
		Total int                    `json:"total"`
		Items []model.NormalizedItem `json:"items"`
	}
	_ = json.NewDecoder(resp2.Body).Decode(&itemsBody)
	if itemsBody.Total != 1 || len(itemsBody.Items) != 1 || itemsBody.Items[0].RowIndex != 10 {
		t.Fatalf("expected 1 item with RowIndex 10, got %d items", itemsBody.Total)
	}

	// Test 3: GET /api/v1/items?status_barang=OTHER
	req3, _ := http.NewRequest("GET", "/api/v1/items?status_barang=OTHER", nil)
	resp3, err := srv.App().Test(req3)
	if err != nil || resp3.StatusCode != http.StatusOK {
		t.Fatalf("GET items status_barang=OTHER failed: %v, code=%d", err, resp3.StatusCode)
	}
	var itemsBodyOther struct {
		Total int                    `json:"total"`
		Items []model.NormalizedItem `json:"items"`
	}
	_ = json.NewDecoder(resp3.Body).Decode(&itemsBodyOther)
	if itemsBodyOther.Total != 1 || len(itemsBodyOther.Items) != 1 || itemsBodyOther.Items[0].StatusBarang != "VENDOR TRANSIT" {
		t.Fatalf("expected 1 item with VENDOR TRANSIT, got %d items", itemsBodyOther.Total)
	}

	// Test 4: GET /api/v1/items/export?status_barang=OTHER
	req4, _ := http.NewRequest("GET", "/api/v1/items/export?status_barang=OTHER", nil)
	resp4, err := srv.App().Test(req4)
	if err != nil || resp4.StatusCode != http.StatusOK {
		t.Fatalf("GET items/export failed: %v, code=%d", err, resp4.StatusCode)
	}
	defer resp4.Body.Close()
	csvBytes, _ := io.ReadAll(resp4.Body)
	csvStr := string(csvBytes)
	if !strings.Contains(csvStr, "VENDOR TRANSIT") || strings.Contains(csvStr, "STOK GUDANG") {
		t.Fatalf("expected exported CSV to include VENDOR TRANSIT and exclude STOK GUDANG, got: %s", csvStr)
	}
}

func TestOrdersAndItems_SortingHTTP(t *testing.T) {
	srv, store, _ := setupTestServer(t)
	ctx := context.Background()

	items := []model.NormalizedItem{
		{RowIndex: 1, Tanggal: model.ParseDate("10/01/2026"), Customer: "Zebra Hospital", StatusOrder: "SELESAI", NamaBarang: "Item Z"},
		{RowIndex: 2, Tanggal: model.ParseDate("10/01/2026"), Customer: "Alpha Hospital", StatusOrder: "SELESAI", NamaBarang: "Item A"},
	}
	orders := []model.Order{
		{ID: "ORD-Z", Tanggal: model.ParseDate("10/01/2026"), Customer: "Zebra Hospital", Items: []model.OrderItem{{RowIndex: 1, StatusOrder: "SELESAI"}}},
		{ID: "ORD-A", Tanggal: model.ParseDate("10/01/2026"), Customer: "Alpha Hospital", Items: []model.OrderItem{{RowIndex: 2, StatusOrder: "SELESAI"}}},
	}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	reqAsc, _ := http.NewRequest("GET", "/api/v1/orders?sort=customer&order=asc", nil)
	respAsc, err := srv.App().Test(reqAsc)
	if err != nil || respAsc.StatusCode != http.StatusOK {
		t.Fatalf("GET orders asc failed: %v", err)
	}
	var bodyAsc struct {
		Orders []model.Order `json:"orders"`
	}
	_ = json.NewDecoder(respAsc.Body).Decode(&bodyAsc)
	if len(bodyAsc.Orders) < 2 {
		t.Fatalf("expected at least 2 orders, got %d", len(bodyAsc.Orders))
	}
	t.Logf("Asc order 0: %s, order 1: %s", bodyAsc.Orders[0].Customer, bodyAsc.Orders[1].Customer)

	reqDesc, _ := http.NewRequest("GET", "/api/v1/orders?sort=customer&order=desc", nil)
	respDesc, err := srv.App().Test(reqDesc)
	if err != nil || respDesc.StatusCode != http.StatusOK {
		t.Fatalf("GET orders desc failed: %v", err)
	}
	var bodyDesc struct {
		Orders []model.Order `json:"orders"`
	}
	_ = json.NewDecoder(respDesc.Body).Decode(&bodyDesc)
	t.Logf("Desc order 0: %s, order 1: %s", bodyDesc.Orders[0].Customer, bodyDesc.Orders[1].Customer)

	if bodyAsc.Orders[0].Customer != "Alpha Hospital" {
		t.Errorf("expected Alpha Hospital first for asc, got %s", bodyAsc.Orders[0].Customer)
	}
	if bodyDesc.Orders[0].Customer != "Zebra Hospital" {
		t.Errorf("expected Zebra Hospital first for desc, got %s", bodyDesc.Orders[0].Customer)
	}
}

func TestAuthAndRBAC(t *testing.T) {
	jwtSecret := "test-jwt-secret-key-32-chars-long!"
	cfg := &config.Config{
		GoogleClientID:   "test-client-id.apps.googleusercontent.com",
		JWTSecret:        jwtSecret,
		SuperadminEmails: "superadmin@example.com",
	}

	srv, store, _ := setupTestServer(t, cfg)
	ctx := context.Background()

	// Seed users with different roles
	guestUser, err := store.UpsertUser(ctx, "guest@example.com", "Guest User", "")
	if err != nil {
		t.Fatalf("failed to create guest user: %v", err)
	}
	normalUser, err := store.UpsertUser(ctx, "user@example.com", "Normal User", "")
	if err != nil {
		t.Fatalf("failed to create normal user: %v", err)
	}
	if err := store.SetUserRole(ctx, "user@example.com", "user"); err != nil {
		t.Fatalf("failed to set user role: %v", err)
	}
	normalUser.Role = "user"

	adminUser, err := store.UpsertUser(ctx, "admin@example.com", "Admin User", "")
	if err != nil {
		t.Fatalf("failed to create admin user: %v", err)
	}
	if err := store.SetUserRole(ctx, "admin@example.com", "admin"); err != nil {
		t.Fatalf("failed to set admin role: %v", err)
	}
	adminUser.Role = "admin"

	superUser, err := store.UpsertUser(ctx, "superadmin@example.com", "Super User", "")
	if err != nil {
		t.Fatalf("failed to create superadmin user: %v", err)
	}

	superEmails := []string{"superadmin@example.com"}

	guestToken, _ := auth.GenerateToken(jwtSecret, guestUser, superEmails)
	userToken, _ := auth.GenerateToken(jwtSecret, normalUser, superEmails)
	adminToken, _ := auth.GenerateToken(jwtSecret, adminUser, superEmails)
	superToken, _ := auth.GenerateToken(jwtSecret, superUser, superEmails)

	// 1. Unauthenticated request to protected endpoint returns 401
	t.Run("unauthenticated request returns 401", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	// 2. Health endpoint is public (returns 200 without cookie)
	t.Run("health endpoint is public 200", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/health", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})

	// 3. /auth/config is public
	t.Run("auth config endpoint is public", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/config", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})

	// 4. Role enforcement on GET /api/v1/orders (minRole: user)
	// guest -> 403, user -> 200, admin -> 200
	t.Run("GET /api/v1/orders guest gets 403", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: guestToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403 for guest on orders, got %d", resp.StatusCode)
		}
	})

	t.Run("GET /api/v1/orders user gets 200", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for user on orders, got %d", resp.StatusCode)
		}
	})

	t.Run("GET /api/v1/orders admin gets 200", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: adminToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for admin on orders, got %d", resp.StatusCode)
		}
	})

	// 5. POST /api/v1/sync requires admin
	// user -> 403, admin -> 200
	t.Run("POST /api/v1/sync user gets 403", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/sync", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403 for user on sync, got %d", resp.StatusCode)
		}
	})

	t.Run("POST /api/v1/sync admin gets 200", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/v1/sync", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: adminToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for admin on sync, got %d", resp.StatusCode)
		}
	})

	// 6. User management endpoints require superadmin
	// user -> 403, superadmin -> 200
	t.Run("GET /api/v1/admin/users user gets 403", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/admin/users", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403 for user on admin/users, got %d", resp.StatusCode)
		}
	})

	t.Run("GET /api/v1/admin/users superadmin gets 200", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/admin/users", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: superToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for superadmin on admin/users, got %d", resp.StatusCode)
		}
	})

	// 7. GET /auth/me
	t.Run("GET /auth/me returns current user info", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/me", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userToken})
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("GET /auth/me unauthenticated returns 401", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/me", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	// 8. POST /auth/logout
	t.Run("POST /auth/logout clears cookie", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/auth/logout", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})

	// 9. POST /api/v1/admin/clear-database requires admin
	t.Run("POST /api/v1/admin/clear-database user gets 403, admin gets 200", func(t *testing.T) {
		reqUser, _ := http.NewRequest("POST", "/api/v1/admin/clear-database", nil)
		reqUser.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userToken})
		respUser, _ := srv.App().Test(reqUser)
		if respUser.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403 for user on clear-database, got %d", respUser.StatusCode)
		}

		reqAdmin, _ := http.NewRequest("POST", "/api/v1/admin/clear-database", nil)
		reqAdmin.AddCookie(&http.Cookie{Name: "warehouse_session", Value: adminToken})
		respAdmin, _ := srv.App().Test(reqAdmin)
		if respAdmin.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for admin on clear-database, got %d", respAdmin.StatusCode)
		}
	})
}
