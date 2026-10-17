package api_test

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
	"github.com/gofiber/fiber/v3"
)

func setupTestServer(t *testing.T) (*api.Server, *storage.Storage, *worker.Worker) {
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
			Tanggal:            "02/01/2026",
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
			Tanggal:            "02/01/2026",
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
			Tanggal:  "02/01/2026",
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
			Tanggal:        "02/01/2026",
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

	fetcher := worker.FetcherFunc(func(ctx context.Context) ([]model.NormalizedItem, []model.Order, error) {
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

	srv := api.New(api.Config{
		Store:  store,
		Worker: w,
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
			Total   int `json:"total"`
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
