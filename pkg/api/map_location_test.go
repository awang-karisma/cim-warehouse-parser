package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/tilecache"
)

type mapRoundTripFunc func(*http.Request) (*http.Response, error)

func (f mapRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func fakePNG(tag string) []byte {
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte(tag)...)
}

func TestCustomerLocationEndpointAndRBAC(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	items := []model.NormalizedItem{{
		RowIndex:    2,
		OrderID:     "ORD-0001",
		Tanggal:     now,
		Customer:    "RSUD Provinsi NTB",
		Area:        "Mataram",
		NamaBarang:  "Reagen",
		Jumlah:      "5",
		StatusOrder: "PROSES",
	}}
	orders := []model.Order{{
		ID:       "ORD-0001",
		Tanggal:  now,
		Customer: "RSUD Provinsi NTB",
		Area:     "Mataram",
		Items:    []model.OrderItem{{RowIndex: 2, NamaBarang: "Reagen", Jumlah: "5", StatusOrder: "PROSES"}},
	}}
	if err := store.SyncMirror(t.Context(), items, orders); err != nil {
		t.Fatal(err)
	}
	if err := store.SetCustomerAlias(t.Context(), "RSUD NTB", "RSUD Provinsi NTB", "Mataram"); err != nil {
		t.Fatal(err)
	}

	userCookie := fixtureIdentity(t, store, "editor@example.test", 2)

	// Unauthenticated -> 401; no grant -> 403
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", "", `{"customer":"RSUD Provinsi NTB","latitude":-8.5833,"longitude":116.1167}`, 401)
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", userCookie, `{"customer":"RSUD Provinsi NTB","latitude":-8.5833,"longitude":116.1167}`, 403)

	// Grant alias:write, customer:read, alias:read
	grantDefaultUser(t, store, model.PermAliasWrite, model.PermCustomerRead, model.PermAliasRead)

	// Validation errors -> 400
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", userCookie, `{"customer":"RSUD Provinsi NTB","latitude":95,"longitude":116.1167}`, 400)
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", userCookie, `{"customer":"RSUD Provinsi NTB","latitude":-8.5833}`, 400)

	// Valid save -> 200
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", userCookie, `{"customer":"RSUD Provinsi NTB","latitude":-8.5833,"longitude":116.1167}`, 200)

	// Appears in GET /api/v1/customers
	custPayload := requestRBAC(t, srv, "GET", "/api/v1/customers?limit=1000", userCookie, "", 200)
	var custResp struct {
		Customers []storage.CustomerSummary `json:"customers"`
	}
	if err := json.Unmarshal(custPayload, &custResp); err != nil {
		t.Fatal(err)
	}
	if len(custResp.Customers) != 1 || custResp.Customers[0].Latitude == nil || *custResp.Customers[0].Latitude != -8.5833 {
		t.Fatalf("expected customer coordinates in list, got %+v", custResp.Customers)
	}

	// Appears in GET /api/v1/customer-aliases
	aliasPayload := requestRBAC(t, srv, "GET", "/api/v1/customer-aliases", userCookie, "", 200)
	var aliasResp struct {
		Groups []storage.CustomerAliasGroup `json:"groups"`
	}
	if err := json.Unmarshal(aliasPayload, &aliasResp); err != nil {
		t.Fatal(err)
	}
	if len(aliasResp.Groups) != 1 || aliasResp.Groups[0].Longitude == nil || *aliasResp.Groups[0].Longitude != 116.1167 {
		t.Fatalf("expected alias group coordinates, got %+v", aliasResp.Groups)
	}

	// Clear coordinates -> 200 and omitted in GET /api/v1/customers
	requestRBAC(t, srv, "PUT", "/api/v1/customers/location", userCookie, `{"customer":"RSUD Provinsi NTB","latitude":null,"longitude":null}`, 200)
	custPayload = requestRBAC(t, srv, "GET", "/api/v1/customers", userCookie, "", 200)
	custResp.Customers = nil
	if err := json.Unmarshal(custPayload, &custResp); err != nil {
		t.Fatal(err)
	}
	if len(custResp.Customers) != 1 || custResp.Customers[0].Latitude != nil || custResp.Customers[0].Longitude != nil {
		t.Fatalf("expected cleared coordinates, got %+v", custResp.Customers)
	}
}

func TestMapTileProxyInvalidationAndRBAC(t *testing.T) {
	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	tileDir := t.TempDir()
	var version atomic.Int32
	version.Store(1)
	var upstreamCalls atomic.Int32

	tc := tilecache.NewWithKeys(tileDir, 24*time.Hour, 10<<20, tilecache.ProviderKeys{Carto: "test-carto-key"}, &http.Client{
		Transport: mapRoundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Query().Get("key") != "test-carto-key" {
				t.Errorf("expected key=test-carto-key in upstream request, got %q", r.URL.RawQuery)
			}
			upstreamCalls.Add(1)
			tag := "tile-v1"
			if version.Load() == 2 {
				tag = "tile-v2"
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(fakePNG(tag))),
				Header:     make(http.Header),
			}, nil
		}),
	})

	cfg := config.DefaultConfig()
	cfg.GoogleClientID = "fixture"
	cfg.JWTSecret = fixtureSecret
	cfg.SuperadminEmails = "recovery@example.test"
	cfg.MapTileCacheDir = tileDir
	cfg.MapTileCacheTTL = 24 * time.Hour
	cfg.MapTileCacheMaxSizeMB = 10

	srv := api.New(api.Config{
		Store:     store,
		AppConfig: &cfg,
		TileCache: tc,
	})

	userCookie := fixtureIdentity(t, store, "viewer@example.test", 2)

	// Unauthenticated -> 401; no grants -> 403
	requestRBAC(t, srv, "GET", "/api/v1/map-tiles/config", "", "", 401)
	requestRBAC(t, srv, "GET", "/api/v1/map-tiles/config", userCookie, "", 403)
	requestRBAC(t, srv, "GET", "/api/v1/map-tiles/carto-dark/8/210/134.png", "", "", 401)
	requestRBAC(t, srv, "GET", "/api/v1/map-tiles/carto-dark/8/210/134.png", userCookie, "", 403)
	requestRBAC(t, srv, "POST", "/api/v1/admin/map-tiles/invalidate", "", "", 401)
	requestRBAC(t, srv, "POST", "/api/v1/admin/map-tiles/invalidate", userCookie, "", 403)

	// Grant area:read -> tile config & proxy work (MISS then HIT), invalidate still 403
	grantDefaultUser(t, store, model.PermAreaRead)
	tileCfgBody := requestRBAC(t, srv, "GET", "/api/v1/map-tiles/config", userCookie, "", 200)
	var tileCfg struct {
		Carto     bool `json:"carto_api_key_configured"`
		OSM       bool `json:"osm_api_key_configured"`
		Satellite bool `json:"satellite_api_key_configured"`
	}
	if err := json.Unmarshal(tileCfgBody, &tileCfg); err != nil || !tileCfg.Carto || tileCfg.OSM || tileCfg.Satellite {
		t.Fatalf("unexpected tile config response: %s", tileCfgBody)
	}
	requestRBAC(t, srv, "POST", "/api/v1/admin/map-tiles/invalidate", userCookie, "", 403)
	requestRBAC(t, srv, "GET", "/api/v1/map-tiles/invalid/8/210/134.png", userCookie, "", 400)

	doTileReq := func() (*http.Response, []byte) {
		t.Helper()
		req, _ := http.NewRequest("GET", "/api/v1/map-tiles/carto-dark/8/210/134.png", nil)
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: userCookie})
		res, err := srv.App().Test(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res, body
	}

	res, body := doTileReq()
	if res.StatusCode != 200 || res.Header.Get("X-Tile-Cache") != "MISS" || !bytes.Equal(body, fakePNG("tile-v1")) {
		t.Fatalf("expected 200 MISS tile-v1, got %d %s %q", res.StatusCode, res.Header.Get("X-Tile-Cache"), body)
	}

	res, body = doTileReq()
	if res.StatusCode != 200 || res.Header.Get("X-Tile-Cache") != "HIT" || !bytes.Equal(body, fakePNG("tile-v1")) {
		t.Fatalf("expected 200 HIT tile-v1, got %d %s %q", res.StatusCode, res.Header.Get("X-Tile-Cache"), body)
	}
	if upstreamCalls.Load() != 1 {
		t.Fatalf("expected 1 upstream call, got %d", upstreamCalls.Load())
	}

	// Grant system:read -> invalidate works, leaves file on disk, updates /api/v1/config, next tile fetch REVALIDATED
	grantDefaultUser(t, store, model.PermAreaRead, model.PermSystemRead)
	invBody := requestRBAC(t, srv, "POST", "/api/v1/admin/map-tiles/invalidate", userCookie, "", 200)
	var invResp struct {
		Status        string `json:"status"`
		InvalidatedAt string `json:"invalidated_at"`
	}
	if err := json.Unmarshal(invBody, &invResp); err != nil || invResp.Status != "ok" || invResp.InvalidatedAt == "" {
		t.Fatalf("unexpected invalidate response: %s", invBody)
	}

	// File must still exist on disk (non-destructive)
	if _, err := os.Stat(filepath.Join(tileDir, "carto-dark", "8", "210", "134.png")); err != nil {
		t.Fatalf("expected cached file to remain on disk after invalidate: %v", err)
	}

	// Config endpoint reflects tile cache settings + invalidated_at
	cfgPayload := requestRBAC(t, srv, "GET", "/api/v1/config", userCookie, "", 200)
	var cfgResp api.ConfigResponse
	if err := json.Unmarshal(cfgPayload, &cfgResp); err != nil {
		t.Fatal(err)
	}
	if cfgResp.MapTileCacheDir != tileDir || cfgResp.MapTileCacheMaxSizeMB != 10 || cfgResp.MapTileInvalidatedAt == "" || !cfgResp.MapCartoAPIKeyConfigured || cfgResp.MapOSMAPIKeyConfigured || cfgResp.MapEsriAPIKeyConfigured {
		t.Fatalf("unexpected config tile cache fields: %+v", cfgResp)
	}
	// Next tile request revalidates with v2
	version.Store(2)
	res, body = doTileReq()
	if res.StatusCode != 200 || res.Header.Get("X-Tile-Cache") != "REVALIDATED" || !bytes.Equal(body, fakePNG("tile-v2")) {
		t.Fatalf("expected 200 REVALIDATED tile-v2, got %d %s %q", res.StatusCode, res.Header.Get("X-Tile-Cache"), body)
	}
}
