package tilecache

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func pngHeader(payload string) []byte {
	// Valid PNG magic bytes followed by distinguishing payload
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte(payload)...)
}

func TestTileCacheHitMissInvalidateAndStaleFallback(t *testing.T) {
	dir := t.TempDir()
	var upstreamCalls atomic.Int32
	var upstreamDown atomic.Bool
	var version atomic.Int32
	version.Store(1)

	client := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			upstreamCalls.Add(1)
			if upstreamDown.Load() {
				return nil, errors.New("network unreachable")
			}
			body := pngHeader("v1")
			if version.Load() == 2 {
				body = pngHeader("v2")
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	cache := New(dir, 24*time.Hour, 10<<20, client)
	ctx := context.Background()

	// 1. First request -> MISS, written to disk
	data, ct, status, err := cache.GetTile(ctx, "carto-dark", 8, 210, 134)
	if err != nil {
		t.Fatalf("first GetTile failed: %v", err)
	}
	if status != StatusMiss || ct != "image/png" || !bytes.Equal(data, pngHeader("v1")) {
		t.Fatalf("unexpected first response: status=%s ct=%s data=%q", status, ct, data)
	}
	if upstreamCalls.Load() != 1 {
		t.Fatalf("expected 1 upstream call, got %d", upstreamCalls.Load())
	}

	tilePath := filepath.Join(dir, "carto-dark", "8", "210", "134.png")
	if _, err := os.Stat(tilePath); err != nil {
		t.Fatalf("expected tile file on disk: %v", err)
	}

	// 2. Second request -> HIT, zero upstream calls
	data, _, status, err = cache.GetTile(ctx, "carto-dark", 8, 210, 134)
	if err != nil {
		t.Fatalf("second GetTile failed: %v", err)
	}
	if status != StatusHit || !bytes.Equal(data, pngHeader("v1")) {
		t.Fatalf("expected HIT v1, got status=%s data=%q", status, data)
	}
	if upstreamCalls.Load() != 1 {
		t.Fatalf("expected still 1 upstream call, got %d", upstreamCalls.Load())
	}

	// 3. Soft invalidate -> file MUST remain on disk
	invAt, err := cache.Invalidate()
	if err != nil || invAt.IsZero() {
		t.Fatalf("Invalidate failed: at=%v err=%v", invAt, err)
	}
	if _, err := os.Stat(tilePath); err != nil {
		t.Fatalf("Invalidate must not delete cached tile file: %v", err)
	}

	// 4. Upstream down after invalidation -> serves STALE file from disk
	upstreamDown.Store(true)
	data, _, status, err = cache.GetTile(ctx, "carto-dark", 8, 210, 134)
	if err != nil {
		t.Fatalf("expected stale fallback, got err: %v", err)
	}
	if status != StatusStale || !bytes.Equal(data, pngHeader("v1")) {
		t.Fatalf("expected STALE v1, got status=%s data=%q", status, data)
	}

	// 5. Upstream recovers with v2 -> REVALIDATED and atomically replaced on disk
	upstreamDown.Store(false)
	version.Store(2)
	data, _, status, err = cache.GetTile(ctx, "carto-dark", 8, 210, 134)
	if err != nil {
		t.Fatalf("revalidation failed: %v", err)
	}
	if status != StatusRevalidated || !bytes.Equal(data, pngHeader("v2")) {
		t.Fatalf("expected REVALIDATED v2, got status=%s data=%q", status, data)
	}

	// 6. Next request after revalidation -> HIT v2 without hitting upstream
	prevCalls := upstreamCalls.Load()
	data, _, status, err = cache.GetTile(ctx, "carto-dark", 8, 210, 134)
	if err != nil {
		t.Fatalf("post-revalidation GetTile failed: %v", err)
	}
	if status != StatusHit || !bytes.Equal(data, pngHeader("v2")) {
		t.Fatalf("expected HIT v2, got status=%s data=%q", status, data)
	}
	if upstreamCalls.Load() != prevCalls {
		t.Fatalf("expected no upstream call on fresh HIT")
	}

	// 7. Reopening cache loads cache-state.json watermark
	cache2 := New(dir, 24*time.Hour, 10<<20, client)
	if cache2.InvalidatedAt().IsZero() {
		t.Fatalf("expected cache2 to load persisted invalidated_at")
	}
}

func TestTileCacheMaxSizeEvictsOldestFirst(t *testing.T) {
	dir := t.TempDir()
	payload := append(pngHeader(""), bytes.Repeat([]byte("a"), 92)...) // 100 bytes per tile

	client := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(payload)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	// Allow at most 250 bytes -> max 2 tiles of 100 bytes each
	cache := New(dir, 24*time.Hour, 250, client)
	ctx := context.Background()

	if _, _, _, err := cache.GetTile(ctx, "osm", 5, 1, 1); err != nil {
		t.Fatalf("tile 1 failed: %v", err)
	}
	t1 := filepath.Join(dir, "osm", "5", "1", "1.png")
	oldTime := time.Now().Add(-3 * time.Hour)
	_ = os.Chtimes(t1, oldTime, oldTime)

	if _, _, _, err := cache.GetTile(ctx, "osm", 5, 1, 2); err != nil {
		t.Fatalf("tile 2 failed: %v", err)
	}
	t2 := filepath.Join(dir, "osm", "5", "1", "2.png")
	midTime := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(t2, midTime, midTime)

	// Tile 3 triggers eviction of tile 1 (oldest), preserving tile 2 and tile 3
	if _, _, _, err := cache.GetTile(ctx, "osm", 5, 1, 3); err != nil {
		t.Fatalf("tile 3 failed: %v", err)
	}
	t3 := filepath.Join(dir, "osm", "5", "1", "3.png")

	if _, err := os.Stat(t1); !os.IsNotExist(err) {
		t.Fatalf("expected oldest tile 1 to be evicted, stat err=%v", err)
	}
	if _, err := os.Stat(t2); err != nil {
		t.Fatalf("expected tile 2 to remain, err=%v", err)
	}
	if _, err := os.Stat(t3); err != nil {
		t.Fatalf("expected newest tile 3 to remain, err=%v", err)
	}
}

func TestTileCacheValidationAndSatelliteOrder(t *testing.T) {
	url, err := buildUpstreamURL("satellite", 10, 841, 536, ProviderKeys{})
	if err != nil {
		t.Fatalf("expected valid satellite url, got %v", err)
	}
	want := "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/536/841"
	if url != want {
		t.Fatalf("expected %q, got %q", want, url)
	}

	keys := ProviderKeys{Carto: "carto+secret", OSM: "osm-key", Satellite: "sat/token"}
	urlCases := []struct {
		provider string
		want     string
	}{
		{"carto-dark", "https://a.basemaps.cartocdn.com/dark_all/8/210/134.png?key=carto%2Bsecret"},
		{"carto-light", "https://a.basemaps.cartocdn.com/light_all/8/210/134.png?key=carto%2Bsecret"},
		{"osm", "https://tile.openstreetmap.org/8/210/134.png?key=osm-key"},
		{"satellite", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/134/210?token=sat%2Ftoken"},
	}
	for _, tc := range urlCases {
		got, err := buildUpstreamURL(tc.provider, 8, 210, 134, keys)
		if err != nil {
			t.Fatalf("%s failed: %v", tc.provider, err)
		}
		if got != tc.want {
			t.Fatalf("%s: want %q, got %q", tc.provider, tc.want, got)
		}
	}
	cache := New(t.TempDir(), time.Hour, 0, nil)
	ctx := context.Background()
	for _, tc := range []struct {
		provider string
		z, x, y  int
	}{
		{"unknown", 1, 0, 0},
		{"osm", -1, 0, 0},
		{"osm", 21, 0, 0},
		{"osm", 2, 4, 0},
		{"osm", 2, 0, -1},
	} {
		_, _, _, err := cache.GetTile(ctx, tc.provider, tc.z, tc.x, tc.y)
		if !errors.Is(err, ErrInvalidTileRequest) {
			t.Fatalf("expected ErrInvalidTileRequest for %+v, got %v", tc, err)
		}
	}
}

func TestTileCacheWatermarkRejectedAndKeysRedactedInErrors(t *testing.T) {
	dir := t.TempDir()
	secret := "super-secret-carto-key-123"
	var mode atomic.Int32 // 0 = watermark, 1 = network error

	client := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Query().Get("key") != secret {
				t.Errorf("expected query key=%q, got %q", secret, r.URL.Query().Get("key"))
			}
			if mode.Load() == 1 {
				return nil, errors.New("connection reset by peer")
			}
			hdr := make(http.Header)
			hdr.Set("ETag", `"wm-da89c20e77c1-dark"`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(pngHeader("watermark"))),
				Header:     hdr,
			}, nil
		}),
	}

	cache := NewWithKeys(dir, time.Hour, 0, ProviderKeys{Carto: secret}, client)
	if !cache.HasProviderKey("carto") || !cache.HasProviderKey("carto-dark") || cache.HasProviderKey("osm") || cache.HasProviderKey("satellite") {
		t.Fatalf("unexpected HasProviderKey results")
	}

	// Watermark tile must be rejected and NOT cached on disk
	_, _, _, err := cache.GetTile(context.Background(), "carto-dark", 8, 210, 134)
	if !errors.Is(err, ErrUpstreamUnavailable) {
		t.Fatalf("expected ErrUpstreamUnavailable on watermark tile, got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(dir, "carto-dark", "8", "210", "134.png")); !os.IsNotExist(statErr) {
		t.Fatalf("watermark tile must not be written to disk")
	}

	// Network error must NOT leak API key in returned error text
	mode.Store(1)
	_, _, _, err = cache.GetTile(context.Background(), "carto-dark", 8, 210, 134)
	if !errors.Is(err, ErrUpstreamUnavailable) {
		t.Fatalf("expected ErrUpstreamUnavailable on network error, got %v", err)
	}
	if bytes.Contains([]byte(err.Error()), []byte(secret)) {
		t.Fatalf("error leaked secret key: %v", err)
	}
}
