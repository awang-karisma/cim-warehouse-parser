import { createSignal } from 'solid-js';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { getMapTileConfig } from '~/api';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export type BasemapMode = 'theme' | 'street' | 'satellite';

const TILE_BUST_STORAGE_KEY = 'warehouse-map-tile-bust';

function readInitialTileBust(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TILE_BUST_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

const [tileCacheBust, setTileCacheBust] = createSignal<string>(readInitialTileBust());
const [cartoKeyConfigured, setCartoKeyConfigured] = createSignal<boolean>(false);

let tileConfigPromise: Promise<void> | null = null;

export { tileCacheBust, cartoKeyConfigured };

export function ensureMapTileConfigLoaded(): Promise<void> {
  if (tileConfigPromise) return tileConfigPromise;
  tileConfigPromise = getMapTileConfig()
    .then((cfg) => {
      setCartoKeyConfigured(Boolean(cfg.carto_api_key_configured));
    })
    .catch(() => {
      // Fall back safely to OSM when config lookup fails; allow retry on next mount.
      tileConfigPromise = null;
    });
  return tileConfigPromise;
}

export function bumpMapTileCacheBust(invalidatedAt: string) {
  const val = invalidatedAt.trim() || String(Date.now());
  setTileCacheBust(val);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(TILE_BUST_STORAGE_KEY, val);
    } catch {
      // ignore storage quota errors
    }
  }
}

export function getBasemapStyle(
  mode: BasemapMode,
  isDark: boolean,
  bust: string = tileCacheBust(),
  useCarto: boolean = cartoKeyConfigured()
): StyleSpecification {
  let provider: 'carto-dark' | 'carto-light' | 'osm' | 'satellite';
  let attribution: string;
  let rasterPaint: Record<string, number> | undefined;

  if (mode === 'street') {
    provider = 'osm';
    attribution = '&copy; OpenStreetMap contributors';
  } else if (mode === 'satellite') {
    provider = 'satellite';
    attribution = 'Tiles &copy; Esri';
  } else if (useCarto) {
    provider = isDark ? 'carto-dark' : 'carto-light';
    attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
  } else {
    // CARTO requires MAP_CARTO_API_KEY; fall back cleanly to OSM tiles with dark-mode styling.
    provider = 'osm';
    attribution = '&copy; OpenStreetMap contributors';
    if (isDark) {
      rasterPaint = {
        'raster-saturation': -0.8,
        'raster-brightness-max': 0.42,
        'raster-contrast': 0.25,
      };
    }
  }

  const query = bust ? `?v=${encodeURIComponent(bust)}` : '';
  const tileUrl = `/api/v1/map-tiles/${provider}/{z}/{x}/{y}.png${query}`;

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [
      {
        id: 'basemap-tiles',
        type: 'raster',
        source: 'basemap',
        minzoom: 0,
        maxzoom: 22,
        ...(rasterPaint ? { paint: rasterPaint } : {}),
      },
    ],
  };
}
