import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import * as maplibregl from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useColorMode } from '@kobalte/core';
import {
  IconBuildingHospital,
  IconFocus2,
  IconMapPin,
} from '@tabler/icons-solidjs';
import { useI18n } from '~/i18n';
import { ORDER_STATUS } from '~/domain';
import type { AreaSummary, CustomerSummary } from '~/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/Badge';
import { MiniStatusBreakdown, computeStatusSegments } from '~/components/MiniStatusBreakdown';
import {
  cartoKeyConfigured,
  ensureMapTileConfigLoaded,
  getBasemapStyle,
  tileCacheBust,
  type BasemapMode,
} from '~/components/mapStyles';
import {
  NTB_AREAS_GEOJSON,
  NTB_BOUNDS,
  normalizeNtbAreaPolygonName,
} from '~/data/ntbAreasGeojson';

export interface AreasMapProps {
  areas: AreaSummary[];
  customers: CustomerSummary[];
  selectedArea: string;
  onSelectArea: (areaName: string) => void;
  canViewOrders: boolean;
  canReadCustomers: boolean;
  onNavigateCustomerOrders: (customerName: string) => void;
}

interface HoveredClientState {
  name: string;
  area: string;
  total_orders: number;
  total_items: number;
  last_order_date: string;
  status_counts: Record<string, number>;
  colocatedCount: number;
  x: number;
  y: number;
}

interface HoveredAreaState {
  name: string;
  polygonName: string;
  total_orders: number;
  total_items: number;
  unique_customers: number;
  status_counts: Record<string, number>;
  x: number;
  y: number;
}

function getDominantDotColor(counts?: Record<string, number>): string {
  const c = counts || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (total === 0) return '#3b82f6';

  const batal = (c[ORDER_STATUS.CANCELLED] || 0) + (c[ORDER_STATUS.CANCEL] || 0);
  if (batal === total) return '#ef4444';
  if ((c[ORDER_STATUS.UNFINISHED] || 0) > 0) return '#eab308';
  if ((c[ORDER_STATUS.PROCESSING] || 0) + (c.PARTIAL || 0) > 0) return '#f59e0b';
  if ((c[ORDER_STATUS.PENDING] || 0) > 0) return '#a855f7';
  if ((c[ORDER_STATUS.COMPLETE] || 0) + (c.COMPLETED || 0) > 0) return '#10b981';
  return '#3b82f6';
}

function parseCountsJSON(raw: unknown): Record<string, number> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const AreasMap: Component<AreasMapProps> = (props) => {
  const { t } = useI18n();
  const { colorMode } = useColorMode();
  const [basemapMode, setBasemapMode] = createSignal<BasemapMode>('theme');
  const [hoveredClient, setHoveredClient] = createSignal<HoveredClientState | null>(null);
  const [hoveredArea, setHoveredArea] = createSignal<HoveredAreaState | null>(null);
  const [mapReady, setMapReady] = createSignal(false);

  let mapWrapEl: HTMLDivElement | undefined;
  let mapContainerEl: HTMLDivElement | undefined;
  let map: maplibregl.Map | undefined;
  let hoveredPolygonId: string | number | null = null;
  let styleSignature = '';

  const isDark = () => colorMode() === 'dark';

  const areasGeoJSON = createMemo<GeoJSON.FeatureCollection>(() => {
    const statsByPolygon = new Map<
      string,
      {
        canonicalName: string;
        topOrders: number;
        total_orders: number;
        total_items: number;
        unique_customers: number;
        status_counts: Record<string, number>;
      }
    >();

    for (const area of props.areas) {
      const polyName = normalizeNtbAreaPolygonName(area.name);
      if (!polyName) continue;
      const existing = statsByPolygon.get(polyName);
      if (!existing) {
        statsByPolygon.set(polyName, {
          canonicalName: area.name,
          topOrders: area.total_orders,
          total_orders: area.total_orders,
          total_items: area.total_items,
          unique_customers: area.unique_customers,
          status_counts: { ...(area.status_counts || {}) },
        });
      } else {
        if (area.total_orders > existing.topOrders) {
          existing.canonicalName = area.name;
          existing.topOrders = area.total_orders;
        }
        existing.total_orders += area.total_orders;
        existing.total_items += area.total_items;
        existing.unique_customers += area.unique_customers;
        for (const [k, v] of Object.entries(area.status_counts || {})) {
          existing.status_counts[k] = (existing.status_counts[k] || 0) + v;
        }
      }
    }

    const selectedNorm = normalizeNtbAreaPolygonName(props.selectedArea || '');

    return {
      type: 'FeatureCollection',
      features: NTB_AREAS_GEOJSON.features.map((f) => {
        const polyName = f.properties.name;
        const stat = statsByPolygon.get(polyName);
        return {
          type: 'Feature',
          id: f.id,
          geometry: f.geometry,
          properties: {
            polygonName: polyName,
            canonicalName: stat ? stat.canonicalName : polyName,
            total_orders: stat ? stat.total_orders : 0,
            total_items: stat ? stat.total_items : 0,
            unique_customers: stat ? stat.unique_customers : 0,
            status_counts_json: JSON.stringify(stat ? stat.status_counts : {}),
            is_selected: Boolean(selectedNorm && selectedNorm === polyName),
          },
        };
      }),
    };
  });

  const clientProjection = createMemo(() => {
    if (!props.canReadCustomers) {
      return {
        mappedCount: 0,
        totalCount: 0,
        clientsGeoJSON: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] },
        spiderLegsGeoJSON: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] },
      };
    }

    const totalCount = props.customers.length;
    const valid = props.customers.filter(
      (c) =>
        typeof c.latitude === 'number' &&
        typeof c.longitude === 'number' &&
        Number.isFinite(c.latitude) &&
        Number.isFinite(c.longitude)
    );

    const groups = new Map<string, CustomerSummary[]>();
    for (const c of valid) {
      const key = `${c.latitude!.toFixed(5)},${c.longitude!.toFixed(5)}`;
      const list = groups.get(key);
      if (list) list.push(c);
      else groups.set(key, [c]);
    }

    const clientFeatures: GeoJSON.Feature[] = [];
    const legFeatures: GeoJSON.Feature[] = [];

    for (const group of groups.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name));
      const k = group.length;
      if (k === 1) {
        const c = group[0];
        clientFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.longitude!, c.latitude!] },
          properties: {
            name: c.name,
            area: c.area || '',
            total_orders: c.total_orders,
            total_items: c.total_items,
            last_order_date: c.last_order_date || '',
            status_counts_json: JSON.stringify(c.status_counts || {}),
            dot_color: getDominantDotColor(c.status_counts),
            colocated_count: 1,
          },
        });
      } else {
        const baseLat = group[0].latitude!;
        const baseLng = group[0].longitude!;
        const ringRadius = 0.00035 * (1 + Math.floor((k - 2) / 8));
        const cosLat = Math.max(0.2, Math.cos((baseLat * Math.PI) / 180));

        group.forEach((c, idx) => {
          const theta = (2 * Math.PI * idx) / k;
          const offsetLat = baseLat + ringRadius * Math.sin(theta);
          const offsetLng = baseLng + (ringRadius * Math.cos(theta)) / cosLat;

          legFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [baseLng, baseLat],
                [offsetLng, offsetLat],
              ],
            },
            properties: {},
          });

          clientFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [offsetLng, offsetLat] },
            properties: {
              name: c.name,
              area: c.area || '',
              total_orders: c.total_orders,
              total_items: c.total_items,
              last_order_date: c.last_order_date || '',
              status_counts_json: JSON.stringify(c.status_counts || {}),
              dot_color: getDominantDotColor(c.status_counts),
              colocated_count: k,
            },
          });
        });
      }
    }

    return {
      mappedCount: valid.length,
      totalCount,
      clientsGeoJSON: { type: 'FeatureCollection' as const, features: clientFeatures },
      spiderLegsGeoJSON: { type: 'FeatureCollection' as const, features: legFeatures },
    };
  });

  const clearPolygonHover = () => {
    if (map && hoveredPolygonId !== null && map.getSource('ntb-areas')) {
      map.setFeatureState({ source: 'ntb-areas', id: hoveredPolygonId }, { hover: false });
    }
    hoveredPolygonId = null;
  };

  const installDataLayers = (m: maplibregl.Map) => {
    if (!m.getSource('ntb-areas')) {
      m.addSource('ntb-areas', {
        type: 'geojson',
        data: areasGeoJSON(),
      });
    }
    if (!m.getSource('ntb-spider-legs')) {
      m.addSource('ntb-spider-legs', {
        type: 'geojson',
        data: clientProjection().spiderLegsGeoJSON,
      });
    }
    if (!m.getSource('ntb-clients')) {
      m.addSource('ntb-clients', {
        type: 'geojson',
        data: clientProjection().clientsGeoJSON,
      });
    }

    const dark = isDark();

    if (!m.getLayer('ntb-areas-fill')) {
      m.addLayer({
        id: 'ntb-areas-fill',
        type: 'fill',
        source: 'ntb-areas',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'total_orders'],
            0,
            dark ? '#334155' : '#94a3b8',
            1,
            '#38bdf8',
            25,
            '#3b82f6',
            100,
            '#2563eb',
            300,
            '#1d4ed8',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.44,
            ['boolean', ['get', 'is_selected'], false],
            0.34,
            0.16,
          ],
        },
      });
    }

    if (!m.getLayer('ntb-areas-outline')) {
      m.addLayer({
        id: 'ntb-areas-outline',
        type: 'line',
        source: 'ntb-areas',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#60a5fa',
            ['boolean', ['get', 'is_selected'], false],
            '#3b82f6',
            dark ? '#64748b' : '#475569',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.5,
            ['boolean', ['get', 'is_selected'], false],
            2.5,
            1.2,
          ],
          'line-opacity': 0.85,
        },
      });
    }

    if (!m.getLayer('ntb-spider-legs')) {
      m.addLayer({
        id: 'ntb-spider-legs',
        type: 'line',
        source: 'ntb-spider-legs',
        paint: {
          'line-color': dark ? '#cbd5e1' : '#475569',
          'line-width': 1.25,
          'line-dasharray': [2, 2],
          'line-opacity': 0.75,
        },
      });
    }

    if (!m.getLayer('ntb-clients-halo')) {
      m.addLayer({
        id: 'ntb-clients-halo',
        type: 'circle',
        source: 'ntb-clients',
        filter: ['==', ['get', 'name'], ''],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'total_orders'],
            1,
            13,
            25,
            16,
            100,
            20,
          ],
          'circle-color': ['get', 'dot_color'],
          'circle-opacity': 0.28,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['get', 'dot_color'],
          'circle-stroke-opacity': 0.85,
        },
      });
    }

    if (!m.getLayer('ntb-clients-circle')) {
      m.addLayer({
        id: 'ntb-clients-circle',
        type: 'circle',
        source: 'ntb-clients',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'total_orders'],
            1,
            6,
            10,
            8,
            50,
            10.5,
            150,
            13,
          ],
          'circle-color': ['get', 'dot_color'],
          'circle-opacity': 0.92,
          'circle-stroke-width': 1.75,
          'circle-stroke-color': dark ? '#0f172a' : '#ffffff',
        },
      });
    }

    setMapReady(true);
  };

  onMount(() => {
    if (!mapContainerEl) return;
    void ensureMapTileConfigLoaded();

    const mode = basemapMode();
    const dark = isDark();
    const bust = tileCacheBust();
    const useCarto = cartoKeyConfigured();
    styleSignature = `${mode}:${dark}:${bust}:${useCarto}`;

    map = new maplibregl.Map({
      container: mapContainerEl,
      style: getBasemapStyle(mode, dark, bust, useCarto),
      bounds: NTB_BOUNDS,
      fitBoundsOptions: { padding: 28 },
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('style.load', () => {
      if (map) {
        hoveredPolygonId = null;
        installDataLayers(map);
      }
    });
    if (map.isStyleLoaded()) {
      installDataLayers(map);
    }
    map.on('mousemove', (e) => {
      if (!map) return;

      const clientHits = map.getLayer('ntb-clients-circle')
        ? map.queryRenderedFeatures(e.point, { layers: ['ntb-clients-circle'] })
        : [];

      if (clientHits.length > 0) {
        clearPolygonHover();
        const p = clientHits[0].properties || {};
        setHoveredArea(null);
        setHoveredClient({
          name: String(p.name || ''),
          area: String(p.area || ''),
          total_orders: Number(p.total_orders || 0),
          total_items: Number(p.total_items || 0),
          last_order_date: String(p.last_order_date || ''),
          status_counts: parseCountsJSON(p.status_counts_json),
          colocatedCount: Number(p.colocated_count || 1),
          x: e.point.x,
          y: e.point.y,
        });
        map.getCanvas().style.cursor = 'pointer';
        return;
      }

      setHoveredClient(null);

      const areaHits = map.getLayer('ntb-areas-fill')
        ? map.queryRenderedFeatures(e.point, { layers: ['ntb-areas-fill'] })
        : [];

      if (areaHits.length > 0) {
        const hit = areaHits[0];
        const hitId = hit.id ?? null;
        if (hoveredPolygonId !== hitId) {
          clearPolygonHover();
          if (hitId !== null && map.getSource('ntb-areas')) {
            hoveredPolygonId = hitId;
            map.setFeatureState({ source: 'ntb-areas', id: hitId }, { hover: true });
          }
        }
        const p = hit.properties || {};
        setHoveredArea({
          name: String(p.canonicalName || p.polygonName || ''),
          polygonName: String(p.polygonName || ''),
          total_orders: Number(p.total_orders || 0),
          total_items: Number(p.total_items || 0),
          unique_customers: Number(p.unique_customers || 0),
          status_counts: parseCountsJSON(p.status_counts_json),
          x: e.point.x,
          y: e.point.y,
        });
        map.getCanvas().style.cursor = 'pointer';
        return;
      }

      clearPolygonHover();
      setHoveredArea(null);
      map.getCanvas().style.cursor = '';
    });

    map.on('mouseout', () => {
      clearPolygonHover();
      setHoveredClient(null);
      setHoveredArea(null);
      if (map) map.getCanvas().style.cursor = '';
    });

    map.on('click', (e) => {
      if (!map) return;

      const clientHits = map.getLayer('ntb-clients-circle')
        ? map.queryRenderedFeatures(e.point, { layers: ['ntb-clients-circle'] })
        : [];
      if (clientHits.length > 0) {
        const clientName = String(clientHits[0].properties?.name || '');
        if (clientName && props.canViewOrders) {
          props.onNavigateCustomerOrders(clientName);
        }
        return;
      }

      const areaHits = map.getLayer('ntb-areas-fill')
        ? map.queryRenderedFeatures(e.point, { layers: ['ntb-areas-fill'] })
        : [];
      if (areaHits.length > 0) {
        const canonicalName = String(areaHits[0].properties?.canonicalName || '');
        if (canonicalName) {
          props.onSelectArea(canonicalName);
        }
      }
    });

    onCleanup(() => {
      map?.remove();
      map = undefined;
    });
  });

  // React to basemap mode, light/dark color mode, or manual tile cache invalidation
  createEffect(() => {
    const mode = basemapMode();
    const dark = isDark();
    const bust = tileCacheBust();
    const useCarto = cartoKeyConfigured();
    const nextSig = `${mode}:${dark}:${bust}:${useCarto}`;
    if (map && styleSignature && nextSig !== styleSignature) {
      styleSignature = nextSig;
      setMapReady(false);
      map.setStyle(getBasemapStyle(mode, dark, bust, useCarto), { diff: false });
    }
  });

  // Push updated area GeoJSON to MapLibre source
  createEffect(() => {
    const data = areasGeoJSON();
    if (!mapReady() || !map) return;
    const src = map.getSource('ntb-areas') as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
  });

  // Push updated client & spider-leg GeoJSON to MapLibre sources
  createEffect(() => {
    const proj = clientProjection();
    if (!mapReady() || !map) return;
    const legsSrc = map.getSource('ntb-spider-legs') as maplibregl.GeoJSONSource | undefined;
    const clientsSrc = map.getSource('ntb-clients') as maplibregl.GeoJSONSource | undefined;
    legsSrc?.setData(proj.spiderLegsGeoJSON);
    clientsSrc?.setData(proj.clientsGeoJSON);
  });

  // Sync hovered client halo filter
  createEffect(() => {
    const client = hoveredClient();
    if (!mapReady() || !map || !map.getLayer('ntb-clients-halo')) return;
    map.setFilter('ntb-clients-halo', ['==', ['get', 'name'], client ? client.name : '']);
  });

  const handleFitNTB = () => {
    map?.fitBounds(NTB_BOUNDS, { padding: 28, duration: 400 });
  };

  const tooltipStyle = (x: number, y: number) => {
    const width = mapWrapEl?.clientWidth || 800;
    const height = mapWrapEl?.clientHeight || 440;
    const cardW = 280;
    const cardH = 210;
    const offset = 14;
    const left = x + offset + cardW > width ? Math.max(8, x - cardW - offset) : x + offset;
    const top = y + offset + cardH > height ? Math.max(8, y - cardH - offset) : y + offset;
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${cardW}px`,
    };
  };

  return (
    <Card class="overflow-hidden">
      <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 pb-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <CardTitle class="text-base font-semibold">{t('areas.mapTitle')}</CardTitle>
            <Show when={props.canReadCustomers}>
              <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                <IconMapPin class="size-3 shrink-0" />
                <span>
                  {t('areas.clientsMapped', {
                    mapped: clientProjection().mappedCount,
                    total: clientProjection().totalCount,
                  })}
                </span>
              </span>
            </Show>
          </div>
          <CardDescription class="mt-0.5">{t('areas.mapSubtitle')}</CardDescription>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <div class="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
            {(['theme', 'street', 'satellite'] as const).map((mode) => (
              <button
                type="button"
                class={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  basemapMode() === mode
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setBasemapMode(mode)}
              >
                {mode === 'theme'
                  ? t('areas.basemapTheme')
                  : mode === 'street'
                    ? t('areas.basemapStreet')
                    : t('areas.basemapSatellite')}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs"
            onClick={handleFitNTB}
          >
            <IconFocus2 class="size-3.5" />
            <span>{t('areas.fitNtb')}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent class="space-y-3">
        <div
          ref={mapWrapEl}
          class="relative h-[420px] sm:h-[480px] w-full rounded-lg border border-border overflow-hidden bg-muted/20"
        >
          <div ref={mapContainerEl} class="h-full w-full" />

          {/* Client Hover Card */}
          <Show when={hoveredClient()}>
            {(client) => {
              const segs = () => computeStatusSegments(client().status_counts);
              const selesaiCount = () =>
                (client().status_counts[ORDER_STATUS.COMPLETE] || 0) +
                (client().status_counts.COMPLETED || 0);
              const fulfillmentPct = () =>
                Math.min(100, Math.round((selesaiCount() / Math.max(1, client().total_items)) * 100));

              return (
                <div
                  class="pointer-events-none absolute z-20 rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-xs p-3 space-y-2.5 text-xs"
                  style={tooltipStyle(client().x, client().y)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="font-semibold text-sm leading-tight flex items-center gap-1.5">
                        <IconBuildingHospital class="size-4 text-primary shrink-0" />
                        <span class="truncate">{client().name}</span>
                      </div>
                      <p class="text-[11px] text-muted-foreground truncate mt-0.5">
                        {client().area || t('customers.unknownArea')}
                      </p>
                    </div>
                    <Badge
                      status={t('areas.ordersCount', { count: client().total_orders })}
                      pill
                      class="shrink-0"
                    />
                  </div>

                  <div class="rounded-md bg-muted/50 px-2.5 py-1.5 space-y-1">
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">{t('areas.cardLineItems')}</span>
                      <span class="font-medium text-foreground">
                        {client().total_items.toLocaleString()}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">{t('customers.latestOrder')}</span>
                      <span class="font-medium text-foreground">
                        {client().last_order_date || '-'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">{t('customers.fulfillmentRate')}</span>
                      <span class="font-semibold text-foreground">{fulfillmentPct()}%</span>
                    </div>
                  </div>

                  <Show when={segs().total > 0}>
                    <div class="space-y-1.5">
                      <MiniStatusBreakdown counts={client().status_counts} disableTooltip />
                      <div class="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <For each={segs().items}>
                          {(seg) => (
                            <span class="inline-flex items-center gap-1">
                              <span
                                class="size-2 rounded-full shrink-0"
                                style={{ 'background-color': seg.color }}
                              />
                              <span>
                                {seg.label}: {seg.count}
                              </span>
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>

                  <Show when={client().colocatedCount > 1}>
                    <p class="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5">
                      {t('areas.colocatedUnitsNote', { count: client().colocatedCount })}
                    </p>
                  </Show>

                  <Show when={props.canViewOrders}>
                    <p class="text-[10px] text-primary font-medium border-t border-border/60 pt-1.5">
                      {t('areas.clickClientOrdersHint')}
                    </p>
                  </Show>
                </div>
              );
            }}
          </Show>

          {/* Area Hover Card (only when no client dot is hovered) */}
          <Show when={!hoveredClient() && hoveredArea()}>
            {(area) => {
              const segs = () => computeStatusSegments(area().status_counts);
              return (
                <div
                  class="pointer-events-none absolute z-20 rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-xs p-3 space-y-2.5 text-xs"
                  style={tooltipStyle(area().x, area().y)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="font-semibold text-sm leading-tight flex items-center gap-1.5">
                        <IconMapPin class="size-4 text-primary shrink-0" />
                        <span class="truncate">{area().name}</span>
                      </div>
                      <Show when={area().polygonName !== area().name}>
                        <p class="text-[11px] text-muted-foreground truncate mt-0.5">
                          {area().polygonName}
                        </p>
                      </Show>
                    </div>
                    <Badge
                      status={t('areas.ordersCount', { count: area().total_orders })}
                      pill
                      class="shrink-0"
                    />
                  </div>

                  <div class="rounded-md bg-muted/50 px-2.5 py-1.5 space-y-1">
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">{t('areas.cardCustomers')}</span>
                      <span class="font-medium text-foreground">
                        {area().unique_customers.toLocaleString()}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">{t('areas.cardLineItems')}</span>
                      <span class="font-medium text-foreground">
                        {area().total_items.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Show when={segs().total > 0}>
                    <div class="space-y-1.5">
                      <MiniStatusBreakdown counts={area().status_counts} disableTooltip />
                      <div class="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <For each={segs().items}>
                          {(seg) => (
                            <span class="inline-flex items-center gap-1">
                              <span
                                class="size-2 rounded-full shrink-0"
                                style={{ 'background-color': seg.color }}
                              />
                              <span>
                                {seg.label}: {seg.count}
                              </span>
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </Show>
        </div>

        {/* Compact Map Legend */}
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground px-0.5">
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-medium text-foreground">{t('areas.mapLegendStatus')}:</span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2.5 rounded-full" style={{ 'background-color': '#eab308' }} />
              <span>Belum Selesai</span>
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2.5 rounded-full" style={{ 'background-color': '#f59e0b' }} />
              <span>Proses</span>
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2.5 rounded-full" style={{ 'background-color': '#a855f7' }} />
              <span>Pending</span>
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2.5 rounded-full" style={{ 'background-color': '#10b981' }} />
              <span>Selesai</span>
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2.5 rounded-full" style={{ 'background-color': '#ef4444' }} />
              <span>Batal</span>
            </span>
          </div>
          <span>{t('areas.mapHoverHint')}</span>
        </div>
      </CardContent>
    </Card>
  );
};
