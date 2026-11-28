import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useColorMode } from '@kobalte/core';
import { IconMapPin, IconMap, IconX, IconChevronUp } from '@tabler/icons-solidjs';
import { useI18n } from '~/i18n';
import { Button } from '~/components/ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import {
  cartoKeyConfigured,
  ensureMapTileConfigLoaded,
  getBasemapStyle,
  tileCacheBust,
  type BasemapMode,
} from './mapStyles';
import { NTB_AREA_CENTERS, normalizeNtbAreaPolygonName } from '~/data/ntbAreasGeojson';
import { decodePlusCode } from '~/utils/plusCode';
export interface ParsedCoordinates {
  valid: boolean;
  empty: boolean;
  lat: number | null;
  lng: number | null;
  errorKey?: 'customers.coordBothRequired' | 'customers.coordRangeError';
}

export function parseCoordinatePair(latText: string, lngText: string): ParsedCoordinates {
  const latStr = latText.trim();
  const lngStr = lngText.trim();
  if (!latStr && !lngStr) {
    return { valid: true, empty: true, lat: null, lng: null };
  }
  if (!latStr || !lngStr) {
    return {
      valid: false,
      empty: false,
      lat: null,
      lng: null,
      errorKey: 'customers.coordBothRequired',
    };
  }
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      valid: false,
      empty: false,
      lat: null,
      lng: null,
      errorKey: 'customers.coordRangeError',
    };
  }
  return { valid: true, empty: false, lat, lng };
}

const COORD_PAIR_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

interface PickerMapCanvasProps {
  lat: number | null;
  lng: number | null;
  area?: string;
  disabled?: boolean;
  onSelect: (lat: string, lng: string) => void;
}

const PickerMapCanvas: Component<PickerMapCanvasProps> = (props) => {
  const { t } = useI18n();
  const { colorMode } = useColorMode();
  const [basemapMode, setBasemapMode] = createSignal<BasemapMode>('theme');
  let containerEl: HTMLDivElement | undefined;
  let map: maplibregl.Map | undefined;
  let marker: maplibregl.Marker | undefined;
  let styleSignature = '';

  const isDark = () => colorMode() === 'dark';

  const ensureMarker = (lng: number, lat: number) => {
    if (!map) return;
    if (!marker) {
      marker = new maplibregl.Marker({ draggable: !props.disabled, color: '#3b82f6' })
        .setLngLat([lng, lat])
        .addTo(map);
      marker.on('dragend', () => {
        if (props.disabled || !marker) return;
        const pos = marker.getLngLat();
        props.onSelect(pos.lat.toFixed(6), pos.lng.toFixed(6));
      });
    } else {
      marker.setLngLat([lng, lat]);
    }
  };

  onMount(() => {
    if (!containerEl) return;

    let initialCenter: [number, number] = [116.45, -8.65];
    let initialZoom = 7.5;

    if (props.lat !== null && props.lng !== null) {
      initialCenter = [props.lng, props.lat];
      initialZoom = 15;
    } else if (props.area) {
      const normalized = normalizeNtbAreaPolygonName(props.area);
      const areaCenter = NTB_AREA_CENTERS[normalized] || NTB_AREA_CENTERS[props.area.trim()];
      if (areaCenter) {
        initialCenter = areaCenter;
        initialZoom = 10;
      }
    }
    void ensureMapTileConfigLoaded();

    const mode = basemapMode();
    const dark = isDark();
    const bust = tileCacheBust();
    const useCarto = cartoKeyConfigured();
    styleSignature = `${mode}:${dark}:${bust}:${useCarto}`;

    map = new maplibregl.Map({
      container: containerEl,
      style: getBasemapStyle(mode, dark, bust, useCarto),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    if (props.lat !== null && props.lng !== null) {
      ensureMarker(props.lng, props.lat);
    }

    map.on('click', (e) => {
      if (props.disabled) return;
      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;
      ensureMarker(lng, lat);
      props.onSelect(lat.toFixed(6), lng.toFixed(6));
    });

    onCleanup(() => {
      marker?.remove();
      marker = undefined;
      map?.remove();
      map = undefined;
    });
  });

  createEffect(() => {
    const mode = basemapMode();
    const dark = isDark();
    const bust = tileCacheBust();
    const useCarto = cartoKeyConfigured();
    const nextSig = `${mode}:${dark}:${bust}:${useCarto}`;
    if (map && styleSignature && nextSig !== styleSignature) {
      styleSignature = nextSig;
      map.setStyle(getBasemapStyle(mode, dark, bust, useCarto), { diff: false });
    }
  });

  createEffect(() => {
    const lat = props.lat;
    const lng = props.lng;
    if (!map) return;
    if (lat === null || lng === null) {
      if (marker) {
        marker.remove();
        marker = undefined;
      }
      return;
    }
    const cur = marker?.getLngLat();
    const changed = !cur || Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6;
    if (changed) {
      ensureMarker(lng, lat);
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 280,
      });
    }
  });

  createEffect(() => {
    if (marker) {
      marker.setDraggable(!props.disabled);
    }
  });

  return (
    <div class="relative h-52 w-full rounded-md border border-border overflow-hidden bg-muted/30">
      <div ref={containerEl} class="h-full w-full" />
      <div class="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border/80 bg-background/90 backdrop-blur-xs p-0.5 shadow-xs">
        {(['theme', 'street', 'satellite'] as const).map((mode) => (
          <button
            type="button"
            class={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              basemapMode() === mode
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
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
      <div class="absolute bottom-2 left-2 z-10 pointer-events-none rounded bg-background/85 backdrop-blur-xs px-2 py-0.5 text-[10px] text-muted-foreground border border-border/60">
        {t('customers.mapClickHint')}
      </div>
    </div>
  );
};

export interface CustomerLocationPickerProps {
  latitude: string;
  longitude: string;
  onLatitudeChange: (val: string) => void;
  onLongitudeChange: (val: string) => void;
  area?: string;
  disabled?: boolean;
}

export const CustomerLocationPicker: Component<CustomerLocationPickerProps> = (props) => {
  const { t } = useI18n();
  const [mapOpen, setMapOpen] = createSignal(
    Boolean(props.latitude.trim() && props.longitude.trim())
  );
  const [plusCode, setPlusCode] = createSignal('');
  const [plusCodeError, setPlusCodeError] = createSignal('');

  const parsed = createMemo(() => parseCoordinatePair(props.latitude, props.longitude));
  const hasAnyText = () => Boolean(props.latitude.trim() || props.longitude.trim() || plusCode().trim());

  const applyPlusCode = (raw?: string) => {
    const value = (raw ?? plusCode()).trim();
    if (!value) {
      setPlusCodeError('');
      return;
    }
    const current = parsed();
    const decoded = decodePlusCode(value, {
      area: props.area,
      refLat: current.valid ? current.lat : null,
      refLng: current.valid ? current.lng : null,
    });
    if (!decoded) {
      setPlusCodeError(t('customers.plusCodeInvalidError'));
      return;
    }
    setPlusCodeError('');
    props.onLatitudeChange(decoded.lat.toFixed(6));
    props.onLongitudeChange(decoded.lng.toFixed(6));
  };

  const handlePlusCodeChange = (val: string) => {
    setPlusCode(val);
    if (!val.trim()) {
      setPlusCodeError('');
      return;
    }
    const current = parsed();
    const decoded = decodePlusCode(val, {
      area: props.area,
      refLat: current.valid ? current.lat : null,
      refLng: current.valid ? current.lng : null,
    });
    if (decoded) {
      setPlusCodeError('');
      props.onLatitudeChange(decoded.lat.toFixed(6));
      props.onLongitudeChange(decoded.lng.toFixed(6));
    }
  };

  const handleLatitudeChange = (val: string) => {
    const match = val.match(COORD_PAIR_RE);
    if (match) {
      props.onLatitudeChange(match[1]);
      props.onLongitudeChange(match[2]);
      return;
    }
    props.onLatitudeChange(val);
  };

  return (
    <div class="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <IconMapPin class="size-3.5 text-primary shrink-0" />
          <span>{t('customers.mapCoordinatesLabel')}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <Show when={hasAnyText() && !props.disabled}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
              onClick={() => {
                setPlusCode('');
                setPlusCodeError('');
                props.onLatitudeChange('');
                props.onLongitudeChange('');
              }}
            >
              <IconX class="size-3" />
              <span>{t('customers.clearCoordinates')}</span>
            </Button>
          </Show>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-7 px-2 text-xs gap-1"
            onClick={() => setMapOpen((prev) => !prev)}
          >
            <Show
              when={mapOpen()}
              fallback={
                <>
                  <IconMap class="size-3.5" />
                  <span>{t('customers.pickOnMap')}</span>
                </>
              }
            >
              <IconChevronUp class="size-3.5" />
              <span>{t('customers.hideMap')}</span>
            </Show>
          </Button>
        </div>
      </div>

      <div class="space-y-1">
        <label class="text-[11px] font-medium text-muted-foreground">
          {t('customers.plusCodeLabel')}
        </label>
        <div class="flex items-center gap-1.5">
          <TextField value={plusCode()} onChange={handlePlusCodeChange} class="flex-1 min-w-0">
            <TextFieldInput
              placeholder={t('customers.plusCodePlaceholder')}
              class="h-8 text-xs font-mono w-full"
              disabled={props.disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyPlusCode();
                }
              }}
              onBlur={() => {
                if (plusCode().trim()) applyPlusCode();
              }}
            />
          </TextField>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="h-8 px-2.5 text-xs shrink-0"
            disabled={props.disabled || !plusCode().trim()}
            onClick={() => applyPlusCode()}
          >
            {t('customers.plusCodeApply')}
          </Button>
        </div>
        <Show when={plusCodeError()}>
          <p class="text-[11px] text-destructive">{plusCodeError()}</p>
        </Show>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <TextField value={props.latitude} onChange={handleLatitudeChange} class="w-full">
          <TextFieldLabel class="text-[11px] text-muted-foreground">
            {t('customers.latitudeLabel')}
          </TextFieldLabel>
          <TextFieldInput
            placeholder="-8.583300"
            class="h-8 text-xs font-mono w-full"
            disabled={props.disabled}
          />
        </TextField>

        <TextField value={props.longitude} onChange={props.onLongitudeChange} class="w-full">
          <TextFieldLabel class="text-[11px] text-muted-foreground">
            {t('customers.longitudeLabel')}
          </TextFieldLabel>
          <TextFieldInput
            placeholder="116.116700"
            class="h-8 text-xs font-mono w-full"
            disabled={props.disabled}
          />
        </TextField>
      </div>

      <p class="text-[11px] text-muted-foreground">{t('customers.coordPasteHint')}</p>

      <Show when={mapOpen()}>
        <PickerMapCanvas
          lat={parsed().valid ? parsed().lat : null}
          lng={parsed().valid ? parsed().lng : null}
          area={props.area}
          disabled={props.disabled}
          onSelect={(lat, lng) => {
            props.onLatitudeChange(lat);
            props.onLongitudeChange(lng);
          }}
        />
      </Show>
    </div>
  );
};
