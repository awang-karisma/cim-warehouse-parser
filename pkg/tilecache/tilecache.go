// Package tilecache provides a disk-backed raster map tile proxy cache with
// configurable TTL, oldest-first disk size cap enforcement, non-destructive
// watermark invalidation, and stale-on-error offline fallback.
package tilecache

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// StatusHit indicates the tile was served fresh from disk cache.
	StatusHit = "HIT"
	// StatusMiss indicates the tile was fetched from upstream for the first time.
	StatusMiss = "MISS"
	// StatusRevalidated indicates a stale or invalidated cached tile was freshly replaced from upstream.
	StatusRevalidated = "REVALIDATED"
	// StatusStale indicates upstream failed and an existing cached tile was served as offline fallback.
	StatusStale = "STALE"

	maxZoomLevel    = 20
	maxTileBodySize = 10 << 20 // 10 MiB safety cap per tile
	stateFileName   = "cache-state.json"
	userAgent       = "warehouse-parser/1.0 (+internal-map-tile-cache)"
)

var (
	// ErrInvalidTileRequest indicates an unsupported provider or out-of-range z/x/y coordinate.
	ErrInvalidTileRequest = errors.New("invalid map tile request")
	// ErrUpstreamUnavailable indicates the upstream tile server failed and no cached tile exists.
	ErrUpstreamUnavailable = errors.New("map tile upstream unavailable")
)

type cacheState struct {
	InvalidatedAt time.Time `json:"invalidated_at"`
}

type inflightCall struct {
	done        chan struct{}
	data        []byte
	contentType string
	status      string
	err         error
}

// ProviderKeys holds optional upstream API keys/tokens for supported map tile providers.
type ProviderKeys struct {
	Carto     string
	OSM       string
	Satellite string
}

// Cache caches raster map tiles on local disk per provider/z/x/y.
type Cache struct {
	dir        string
	ttl        time.Duration
	maxBytes   int64
	keys       ProviderKeys
	httpClient *http.Client

	stateMu       sync.RWMutex
	invalidatedAt time.Time

	inflightMu sync.Mutex
	inflight   map[string]*inflightCall

	evictMu sync.Mutex
}

// New constructs a disk-backed tile cache without upstream API keys.
// If dir is empty, defaults to "data/maptiles".
// ttl <= 0 disables age-based expiry; maxBytes <= 0 disables size-based eviction.
func New(dir string, ttl time.Duration, maxBytes int64, httpClient *http.Client) *Cache {
	return NewWithKeys(dir, ttl, maxBytes, ProviderKeys{}, httpClient)
}

// NewWithKeys constructs a disk-backed tile cache with optional per-provider API keys.
func NewWithKeys(dir string, ttl time.Duration, maxBytes int64, keys ProviderKeys, httpClient *http.Client) *Cache {
	cleanDir := strings.TrimSpace(dir)
	if cleanDir == "" {
		cleanDir = "data/maptiles"
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	c := &Cache{
		dir:      cleanDir,
		ttl:      ttl,
		maxBytes: maxBytes,
		keys: ProviderKeys{
			Carto:     strings.TrimSpace(keys.Carto),
			OSM:       strings.TrimSpace(keys.OSM),
			Satellite: strings.TrimSpace(keys.Satellite),
		},
		httpClient: httpClient,
		inflight:   make(map[string]*inflightCall),
	}
	c.loadState()
	return c
}

// HasProviderKey reports whether a non-empty API key is configured for the given provider family.
func (c *Cache) HasProviderKey(provider string) bool {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "carto", "carto-dark", "carto-light":
		return c.keys.Carto != ""
	case "osm":
		return c.keys.OSM != ""
	case "satellite":
		return c.keys.Satellite != ""
	default:
		return false
	}
}

func (c *Cache) loadState() {
	raw, err := os.ReadFile(filepath.Join(c.dir, stateFileName))
	if err != nil {
		return
	}
	var st cacheState
	if err := json.Unmarshal(raw, &st); err != nil {
		return
	}
	if !st.InvalidatedAt.IsZero() {
		c.invalidatedAt = st.InvalidatedAt.UTC()
	}
}

// InvalidatedAt returns the last soft-invalidation watermark timestamp, or zero time if never invalidated.
func (c *Cache) InvalidatedAt() time.Time {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	return c.invalidatedAt
}

// Invalidate records a new invalidation watermark in cache-state.json without deleting
// any existing cached tile files. Existing tiles are lazily replaced on their next request.
func (c *Cache) Invalidate() (time.Time, error) {
	c.stateMu.Lock()
	defer c.stateMu.Unlock()

	if err := os.MkdirAll(c.dir, 0o755); err != nil {
		return time.Time{}, fmt.Errorf("failed to create map tile cache directory: %w", err)
	}

	now := time.Now().UTC()
	if !c.invalidatedAt.IsZero() && !now.After(c.invalidatedAt) {
		now = c.invalidatedAt.Add(time.Nanosecond)
	}

	payload, err := json.Marshal(cacheState{InvalidatedAt: now})
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to marshal tile cache state: %w", err)
	}

	statePath := filepath.Join(c.dir, stateFileName)
	tmpPath := fmt.Sprintf("%s.tmp.%d", statePath, time.Now().UnixNano())
	if err := os.WriteFile(tmpPath, payload, 0o644); err != nil {
		return time.Time{}, fmt.Errorf("failed to write tile cache state: %w", err)
	}
	if err := os.Rename(tmpPath, statePath); err != nil {
		_ = os.Remove(tmpPath)
		return time.Time{}, fmt.Errorf("failed to commit tile cache state: %w", err)
	}

	c.invalidatedAt = now
	return now, nil
}

func buildUpstreamURL(provider string, z, x, y int, keys ProviderKeys) (string, error) {
	if z < 0 || z > maxZoomLevel {
		return "", fmt.Errorf("%w: zoom %d out of range", ErrInvalidTileRequest, z)
	}
	maxCoord := 1 << z
	if x < 0 || x >= maxCoord || y < 0 || y >= maxCoord {
		return "", fmt.Errorf("%w: coordinates (%d,%d) out of range for zoom %d", ErrInvalidTileRequest, x, y, z)
	}

	switch provider {
	case "carto-dark":
		u := fmt.Sprintf("https://a.basemaps.cartocdn.com/dark_all/%d/%d/%d.png", z, x, y)
		if keys.Carto != "" {
			u += "?key=" + url.QueryEscape(keys.Carto)
		}
		return u, nil
	case "carto-light":
		u := fmt.Sprintf("https://a.basemaps.cartocdn.com/light_all/%d/%d/%d.png", z, x, y)
		if keys.Carto != "" {
			u += "?key=" + url.QueryEscape(keys.Carto)
		}
		return u, nil
	case "osm":
		u := fmt.Sprintf("https://tile.openstreetmap.org/%d/%d/%d.png", z, x, y)
		if keys.OSM != "" {
			u += "?key=" + url.QueryEscape(keys.OSM)
		}
		return u, nil
	case "satellite":
		// Esri World Imagery uses {z}/{y}/{x} ordering and optional ?token= for ArcGIS API keys.
		u := fmt.Sprintf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d", z, y, x)
		if keys.Satellite != "" {
			u += "?token=" + url.QueryEscape(keys.Satellite)
		}
		return u, nil
	default:
		return "", fmt.Errorf("%w: unsupported provider %q", ErrInvalidTileRequest, provider)
	}
}

func (c *Cache) tilePath(provider string, z, x, y int) string {
	return filepath.Join(c.dir, provider, strconv.Itoa(z), strconv.Itoa(x), strconv.Itoa(y)+".png")
}

func (c *Cache) isFresh(modTime time.Time, invalidatedAt time.Time) bool {
	if !invalidatedAt.IsZero() && !modTime.After(invalidatedAt) {
		return false
	}
	if c.ttl > 0 && time.Since(modTime) >= c.ttl {
		return false
	}
	return true
}

func detectTileContentType(data []byte) string {
	ct := http.DetectContentType(data)
	if strings.HasPrefix(ct, "image/") {
		return ct
	}
	return "image/png"
}

// GetTile returns a raster map tile from disk cache or fetches and caches it from upstream.
// Returns tile bytes, MIME content type, cache status (HIT, MISS, REVALIDATED, STALE), and error.
func (c *Cache) GetTile(ctx context.Context, provider string, z, x, y int) ([]byte, string, string, error) {
	upstreamURL, err := buildUpstreamURL(provider, z, x, y, c.keys)
	if err != nil {
		return nil, "", "", err
	}

	path := c.tilePath(provider, z, x, y)
	inv := c.InvalidatedAt()
	if stat, statErr := os.Stat(path); statErr == nil && stat.Size() > 0 && c.isFresh(stat.ModTime(), inv) {
		if data, readErr := os.ReadFile(path); readErr == nil && len(data) > 0 {
			return data, detectTileContentType(data), StatusHit, nil
		}
	}

	key := fmt.Sprintf("%s/%d/%d/%d", provider, z, x, y)
	c.inflightMu.Lock()
	if call, ok := c.inflight[key]; ok {
		c.inflightMu.Unlock()
		select {
		case <-ctx.Done():
			return nil, "", "", ctx.Err()
		case <-call.done:
			return call.data, call.contentType, call.status, call.err
		}
	}

	call := &inflightCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.inflightMu.Unlock()

	go func() {
		defer func() {
			c.inflightMu.Lock()
			delete(c.inflight, key)
			c.inflightMu.Unlock()
			close(call.done)
		}()
		call.data, call.contentType, call.status, call.err = c.fetchAndCache(provider, upstreamURL, path)
	}()

	select {
	case <-ctx.Done():
		return nil, "", "", ctx.Err()
	case <-call.done:
		return call.data, call.contentType, call.status, call.err
	}
}

func (c *Cache) fetchAndCache(provider, upstreamURL, path string) ([]byte, string, string, error) {
	inv := c.InvalidatedAt()
	stat, statErr := os.Stat(path)
	hadFile := statErr == nil && stat.Size() > 0
	if hadFile && c.isFresh(stat.ModTime(), inv) {
		if data, readErr := os.ReadFile(path); readErr == nil && len(data) > 0 {
			return data, detectTileContentType(data), StatusHit, nil
		}
	}

	fetchCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	body, fetchErr := c.fetchUpstream(fetchCtx, provider, upstreamURL)
	if fetchErr == nil && len(body) > 0 {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
			tmpPath := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
			if writeErr := os.WriteFile(tmpPath, body, 0o644); writeErr == nil {
				now := time.Now().UTC()
				if !inv.IsZero() && !now.After(inv) {
					now = inv.Add(time.Millisecond)
				}
				_ = os.Chtimes(tmpPath, now, now)
				if renameErr := os.Rename(tmpPath, path); renameErr == nil {
					if c.maxBytes > 0 {
						c.enforceMaxSize(path)
					}
				} else {
					_ = os.Remove(tmpPath)
				}
			}
		}

		status := StatusMiss
		if hadFile {
			status = StatusRevalidated
		}
		return body, detectTileContentType(body), status, nil
	}

	// Upstream failed: serve existing stale file if present.
	if hadFile {
		if staleData, readErr := os.ReadFile(path); readErr == nil && len(staleData) > 0 {
			return staleData, detectTileContentType(staleData), StatusStale, nil
		}
	}

	if fetchErr == nil {
		fetchErr = errors.New("empty upstream response")
	}
	return nil, "", "", fmt.Errorf("%w: %v", ErrUpstreamUnavailable, fetchErr)
}

func isCartoWatermarkResponse(provider string, resp *http.Response) bool {
	if provider != "carto-dark" && provider != "carto-light" {
		return false
	}
	etag := strings.Trim(strings.TrimSpace(resp.Header.Get("ETag")), "\"")
	return strings.HasPrefix(strings.ToLower(etag), "wm-")
}

func (c *Cache) fetchUpstream(ctx context.Context, provider, upstreamURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL, nil)
	if err != nil {
		return nil, errors.New("failed to construct upstream tile request")
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Never return raw *url.Error containing query API keys/tokens.
		var urlErr *url.Error
		if errors.As(err, &urlErr) && urlErr.Err != nil {
			return nil, fmt.Errorf("upstream %s request failed: %v", provider, urlErr.Err)
		}
		return nil, fmt.Errorf("upstream %s request failed", provider)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}
	if isCartoWatermarkResponse(provider, resp) {
		return nil, errors.New("upstream returned watermark tile (valid MAP_CARTO_API_KEY required)")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxTileBodySize+1))
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, errors.New("upstream returned empty body")
	}
	if len(body) > maxTileBodySize {
		return nil, fmt.Errorf("upstream tile exceeds %d bytes", maxTileBodySize)
	}
	return body, nil
}

type cachedTileEntry struct {
	path    string
	size    int64
	modTime time.Time
}

func (c *Cache) enforceMaxSize(preservePath string) {
	if c.maxBytes <= 0 {
		return
	}
	c.evictMu.Lock()
	defer c.evictMu.Unlock()

	var entries []cachedTileEntry
	var totalBytes int64

	_ = filepath.WalkDir(c.dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".png") || strings.Contains(name, ".tmp.") {
			return nil
		}
		info, infoErr := d.Info()
		if infoErr != nil {
			return nil
		}
		entries = append(entries, cachedTileEntry{
			path:    p,
			size:    info.Size(),
			modTime: info.ModTime(),
		})
		totalBytes += info.Size()
		return nil
	})

	if totalBytes <= c.maxBytes {
		return
	}

	slices.SortFunc(entries, func(a, b cachedTileEntry) int {
		if c := a.modTime.Compare(b.modTime); c != 0 {
			return c
		}
		return cmp.Compare(a.path, b.path)
	})

	cleanPreserve := filepath.Clean(preservePath)
	for _, entry := range entries {
		if totalBytes <= c.maxBytes {
			break
		}
		if filepath.Clean(entry.path) == cleanPreserve {
			continue
		}
		if err := os.Remove(entry.path); err == nil {
			totalBytes -= entry.size
		}
	}
}
