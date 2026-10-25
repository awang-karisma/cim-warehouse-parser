package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/accurate"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/adapter"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/provider/official"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/session"
	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
)

func TestEndToEndSmoke_AccurateAndSpreadsheet(t *testing.T) {
	// 1. Setup mock upstream Accurate service
	mockMux := http.NewServeMux()
	mockServer := httptest.NewServer(mockMux)
	defer mockServer.Close()

	mockMux.HandleFunc("/api/db-list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"s":true,"d":[{"id":1001,"alias":"Smoke Test DB","host":"` + mockServer.URL + `"}]}`))
	})
	mockMux.HandleFunc("/api/open-db.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"s":true,"session":"smoke-sess","host":"` + mockServer.URL + `"}`))
	})
	mockMux.HandleFunc("/accurate/api/item/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"sp": {"page": 1, "pageCount": 1, "pageSize": 50, "rowCount": 1},
			"d": [{"id": 42, "no": "SMK-42", "name": "Smoke Widget", "upcNo": "012345678901", "unit1Name": "BOX", "unitPrice": 45000, "allQuantity": 10, "availableToSell": 8, "itemType": "INVENTORY"}]
		}`))
	})
	mockMux.HandleFunc("/accurate/api/purchase-order/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"sp": {"page": 1, "pageCount": 1, "pageSize": 20, "rowCount": 1},
			"d": [{"id": 777, "number": "PO-SMOKE-01", "transDate": "2026-10-25", "statusName": "Approved", "description": "Smoke PO"}]
		}`))
	})
	mockMux.HandleFunc("/accurate/api/purchase-order/detail.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"d": {
				"id": 777,
				"number": "PO-SMOKE-01",
				"detailItem": [
					{"id": 1, "item": {"id": 42, "no": "SMK-42", "name": "Smoke Widget"}, "quantity": 5, "unitPrice": 45000, "itemUnit": {"name": "BOX"}}
				]
			}
		}`))
	})

	// 2. Setup SQLite database with spreadsheet orders
	dbPath := filepath.Join(t.TempDir(), "smoke.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to init storage: %v", err)
	}
	defer store.Close()

	// Seed spreadsheet order
	initialItem := model.NormalizedItem{
		RowIndex:    2,
		Tanggal:     model.ParseDate("25/10/2026"),
		Customer:    "RSUD Smoke",
		Area:        "Mataram",
		NamaBarang:  "Infusion Set",
		Jumlah:      "10",
		StatusOrder: "SELESAI",
	}
	initialOrder := model.Order{
		ID:       "ORD-SMOKE-1",
		Tanggal:  model.ParseDate("25/10/2026"),
		Customer: "RSUD Smoke",
		Area:     "Mataram",
		Items: []model.OrderItem{
			{
				RowIndex:    2,
				NamaBarang:  "Infusion Set",
				Jumlah:      "10",
				Satuan:      "BOX",
				StatusOrder: "SELESAI",
			},
		},
	}
	if err := store.SyncMirror(context.Background(), []model.NormalizedItem{initialItem}, []model.Order{initialOrder}); err != nil {
		t.Fatalf("failed to sync initial spreadsheet data: %v", err)
	}

	// 3. Initialize Server with Accurate official provider
	appCfg := &config.Config{
		Port:             "8080",
		AccurateProvider: "official",
		AccurateAPIToken: "aat.smoke-test-token",
	}
	prov := official.New("aat.smoke-test-token",
		official.WithBaseURL(mockServer.URL),
		official.WithHTTPClient(mockServer.Client()),
	)
	sm := session.NewManager(store, prov)
	reg := adapter.NewRegistry(prov)

	w, _ := worker.New(appCfg.WorkerConfig(), store, worker.FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
		return []model.NormalizedItem{initialItem}, []model.Order{initialOrder}, nil
	}))

	srv := api.New(api.Config{
		Store:            store,
		Worker:           w,
		AppConfig:        appCfg,
		AccurateProvider: prov,
		AccurateSession:  sm,
		AccurateRegistry: reg,
	})

	// Setup static files to test SPA fallback
	srv.SetupStaticFiles("../../web/dist")

	app := srv.App()

	// 4. Test spreadsheet endpoints still work perfectly
	t.Run("Spreadsheet orders endpoint", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/orders", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("orders request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 from orders, got %d", resp.StatusCode)
		}
		var ordersResp struct {
			Orders []model.Order `json:"orders"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&ordersResp)
		if len(ordersResp.Orders) != 1 || ordersResp.Orders[0].Customer != "RSUD Smoke" {
			t.Fatalf("unexpected orders: %+v", ordersResp.Orders)
		}
	})

	// 5. Test Accurate status endpoint
	t.Run("Accurate status before connect", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/accurate/status", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("status request failed: %v", err)
		}
		defer resp.Body.Close()
		var st struct {
			Enabled   bool   `json:"enabled"`
			Provider  string `json:"provider"`
			Connected bool   `json:"connected"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&st)
		if !st.Enabled || st.Provider != "official" || st.Connected {
			t.Fatalf("unexpected status: %+v", st)
		}
	})

	// 6. Test Accurate login, database list, and selection
	t.Run("Accurate connect & select database", func(t *testing.T) {
		// Login
		loginReq, _ := http.NewRequest("POST", "/api/v1/accurate/login", strings.NewReader(`{}`))
		loginReq.Header.Set("Content-Type", "application/json")
		loginResp, _ := app.Test(loginReq)
		defer loginResp.Body.Close()
		if loginResp.StatusCode != http.StatusOK {
			t.Fatalf("login failed: %d", loginResp.StatusCode)
		}

		// List DBs
		dbsReq, _ := http.NewRequest("GET", "/api/v1/accurate/databases", nil)
		dbsResp, _ := app.Test(dbsReq)
		defer dbsResp.Body.Close()
		var dbs []accurate.Database
		_ = json.NewDecoder(dbsResp.Body).Decode(&dbs)
		if len(dbs) != 1 || dbs[0].ID != 1001 {
			t.Fatalf("unexpected dbs: %+v", dbs)
		}

		// Select DB
		selReq, _ := http.NewRequest("POST", "/api/v1/accurate/database", strings.NewReader(`{"id": 1001}`))
		selReq.Header.Set("Content-Type", "application/json")
		selResp, _ := app.Test(selReq)
		defer selResp.Body.Close()
		if selResp.StatusCode != http.StatusOK {
			t.Fatalf("select DB failed: %d", selResp.StatusCode)
		}

		// Status after connect
		stReq, _ := http.NewRequest("GET", "/api/v1/accurate/status", nil)
		stResp, _ := app.Test(stReq)
		defer stResp.Body.Close()
		var st struct {
			Connected bool               `json:"connected"`
			Database  *accurate.Database `json:"database"`
		}
		_ = json.NewDecoder(stResp.Body).Decode(&st)
		if !st.Connected || st.Database == nil || st.Database.ID != 1001 {
			t.Fatalf("expected connected=true with db 1001, got: %+v", st)
		}
	})

	// 7. Test Inventory search and Transaction documents
	t.Run("Accurate inventory & transaction query", func(t *testing.T) {
		// Search item
		itemsReq, _ := http.NewRequest("GET", "/api/v1/accurate/items?q=Smoke", nil)
		itemsResp, _ := app.Test(itemsReq)
		defer itemsResp.Body.Close()
		var itemsRes accurate.SearchItemsResult
		_ = json.NewDecoder(itemsResp.Body).Decode(&itemsRes)
		if len(itemsRes.Items) != 1 || itemsRes.Items[0].No != "SMK-42" {
			t.Fatalf("unexpected search items: %+v", itemsRes)
		}

		// List PO documents
		docsReq, _ := http.NewRequest("GET", "/api/v1/accurate/sources/purchase-order/documents", nil)
		docsResp, _ := app.Test(docsReq)
		defer docsResp.Body.Close()
		var docsRes struct {
			Documents []accurate.DocumentHeader `json:"documents"`
		}
		_ = json.NewDecoder(docsResp.Body).Decode(&docsRes)
		if len(docsRes.Documents) != 1 || docsRes.Documents[0].Number != "PO-SMOKE-01" {
			t.Fatalf("unexpected docs: %+v", docsRes)
		}

		// Detail PO items
		dtlReq, _ := http.NewRequest("GET", "/api/v1/accurate/sources/purchase-order/documents/777/items", nil)
		dtlResp, _ := app.Test(dtlReq)
		defer dtlResp.Body.Close()
		var lineItems []accurate.NormalizedItem
		_ = json.NewDecoder(dtlResp.Body).Decode(&lineItems)
		if len(lineItems) != 1 || lineItems[0].ItemNo != "SMK-42" || lineItems[0].Quantity != 5 {
			t.Fatalf("unexpected line items: %+v", lineItems)
		}
	})

	// 8. Test SPA routing on /barcode
	t.Run("SPA route /barcode serves frontend", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/barcode", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("barcode route failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for /barcode SPA, got %d", resp.StatusCode)
		}
		cc := resp.Header.Get("Cache-Control")
		if !strings.Contains(cc, "no-cache") || !strings.Contains(cc, "no-store") {
			t.Errorf("expected no-cache/no-store Cache-Control header for index.html, got %q", cc)
		}
		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), "<!DOCTYPE html>") && !strings.Contains(string(body), "html") {
			t.Fatalf("expected HTML index file, got: %s", string(body)[:min(100, len(body))])
		}
	})

	// 9. Test missing /assets/* returns 404 Not Found, never HTML
	t.Run("Missing assets return 404", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/assets/non-existent-old-hash.js", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("missing asset request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404 for missing asset, got %d", resp.StatusCode)
		}
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
