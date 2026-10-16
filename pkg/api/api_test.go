package api_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
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
			ID:       "ORD-0002",
			Tanggal:  "02/01/2026",
			Customer: "RS Patuh Karya",
			Area:     "Lombok Tengah",
			Items: []model.OrderItem{
				{
					RowIndex:           3,
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

func TestSwaggerDocumentation(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	t.Run("swagger json doc", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/swagger/doc.json", nil)
		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("failed to execute request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		ct := resp.Header.Get("Content-Type")
		if !strings.Contains(ct, "application/json") {
			t.Errorf("expected application/json Content-Type, got %s", ct)
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(bodyBytes), "Warehouse Order Tracking API") {
			t.Errorf("expected swagger json to mention API title, got: %s", string(bodyBytes))
		}
	})

	t.Run("swagger ui html", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/swagger", nil)
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

	t.Run("scalar ui html", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/scalar", nil)
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
