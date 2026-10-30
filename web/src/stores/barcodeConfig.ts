import { createSignal, createResource, createEffect, untrack } from 'solid-js';
import { getPageDesigns } from '~/api';
import { loadLayoutFromDesign } from '~/stores/labelLayout';
export { companyName, setCompanyName } from '~/stores/labelLayout';
import type { BarcodeHeight, FontSize, PageDesign, PresetConfig, QtyMode, Symbology } from '~/types';

export const PRESETS: Record<string, PresetConfig> = {
  'tj-108': {
    name: 'Tom & Jerry No. 108',
    paper: 'A4',
    paperWidthMM: 210,
    paperHeightMM: 297,
    labelWidthMM: 38,
    labelHeightMM: 19,
    cols: 5,
    rows: 14,
    gapXMM: 2.5,
    gapYMM: 1.5,
    marginTopMM: 6,
    marginLeftMM: 5,
    isAuditSheet: false,
  },
  'tj-121': {
    name: 'Tom & Jerry No. 121',
    paper: 'A4',
    paperWidthMM: 210,
    paperHeightMM: 297,
    labelWidthMM: 76,
    labelHeightMM: 38,
    cols: 2,
    rows: 5,
    gapXMM: 8,
    gapYMM: 15,
    marginTopMM: 23,
    marginLeftMM: 25,
    isAuditSheet: false,
  },
  'thermal-50-30': {
    name: 'Continuous Thermal 50x30mm',
    paper: 'Roll',
    paperWidthMM: 50,
    paperHeightMM: 30,
    labelWidthMM: 48,
    labelHeightMM: 28,
    cols: 1,
    rows: 1,
    gapXMM: 0,
    gapYMM: 0,
    marginTopMM: 1,
    marginLeftMM: 1,
    isAuditSheet: false,
  },
  'thermal-40-20': {
    name: 'Continuous Thermal 40x20mm',
    paper: 'Roll',
    paperWidthMM: 40,
    paperHeightMM: 20,
    labelWidthMM: 38,
    labelHeightMM: 18,
    cols: 1,
    rows: 1,
    gapXMM: 0,
    gapYMM: 0,
    marginTopMM: 1,
    marginLeftMM: 1,
    isAuditSheet: false,
  },
  'a4-audit': {
    name: 'Lembar Audit Stok Opname (A4)',
    paper: 'A4',
    paperWidthMM: 210,
    paperHeightMM: 297,
    labelWidthMM: 190,
    labelHeightMM: 15,
    cols: 1,
    rows: 18,
    gapXMM: 0,
    gapYMM: 0,
    marginTopMM: 10,
    marginLeftMM: 10,
    isAuditSheet: true,
  },
  custom: {
    name: 'Kustom Ukuran Sendiri',
    paper: 'A4',
    paperWidthMM: 210,
    paperHeightMM: 297,
    labelWidthMM: 38,
    labelHeightMM: 19,
    cols: 5,
    rows: 14,
    gapXMM: 2.5,
    gapYMM: 1.5,
    marginTopMM: 6,
    marginLeftMM: 5,
    isAuditSheet: false,
  },
};

export const [presetKey, setPresetKey] = createSignal<string>('tj-108');
export const [customConfig, setCustomConfig] = createSignal<PresetConfig>({ ...PRESETS.custom });

export const [symbology, setSymbology] = createSignal<Symbology>('CODE128');
export const [barcodeHeight, setBarcodeHeight] = createSignal<BarcodeHeight>('medium');
export const [fontSize, setFontSize] = createSignal<FontSize>('medium');
export const [qtyMode, setQtyMode] = createSignal<QtyMode>('multiply');
export const [skipCount, setSkipCount] = createSignal<number>(0);

export const [showScreenBorder, setShowScreenBorder] = createSignal<boolean>(true);
export const [zoom, setZoom] = createSignal<number>(1.0);


export const [serverDesigns, { refetch: refetchDesigns }] = createResource(
  () => getPageDesigns().then(r => r.designs).catch(() => [] as PageDesign[])
);

export function toPresetConfig(d: PageDesign): PresetConfig {
  return {
    name: d.name,
    paper: d.paper,
    paperWidthMM: d.paper_width_mm,
    paperHeightMM: d.paper_height_mm,
    labelWidthMM: d.label_width_mm,
    labelHeightMM: d.label_height_mm,
    cols: d.cols,
    rows: d.rows,
    gapXMM: d.gap_x_mm,
    gapYMM: d.gap_y_mm,
    marginTopMM: d.margin_top_mm,
    marginLeftMM: d.margin_left_mm,
    isAuditSheet: d.is_audit_sheet,
  };
}

export function fromPresetConfig(cfg: PresetConfig, labelLayout?: string): Omit<PageDesign, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: cfg.name,
    paper: cfg.paper,
    paper_width_mm: cfg.paperWidthMM,
    paper_height_mm: cfg.paperHeightMM,
    label_width_mm: cfg.labelWidthMM,
    label_height_mm: cfg.labelHeightMM,
    cols: cfg.cols,
    rows: cfg.rows,
    gap_x_mm: cfg.gapXMM,
    gap_y_mm: cfg.gapYMM,
    margin_top_mm: cfg.marginTopMM,
    margin_left_mm: cfg.marginLeftMM,
    is_audit_sheet: cfg.isAuditSheet,
    label_layout: labelLayout,
  };
}

createEffect(() => {
  const pk = presetKey();
  const designs = serverDesigns();
  if (pk.startsWith('server-') && designs && designs.length > 0) {
    const id = parseInt(pk.slice(7), 10);
    const match = designs.find((d) => d.id === id);
    if (match) {
      const current = untrack(customConfig);
      if (current.name !== match.name) {
        const cfg = toPresetConfig(match);
        setCustomConfig(cfg);
        loadLayoutFromDesign(match, cfg.labelWidthMM, cfg.labelHeightMM);
      }
    }
  }
});

export function selectPreset(key: string): void {
  setPresetKey(key);
  if (key.startsWith('server-')) {
    const id = parseInt(key.slice(7), 10);
    const designs = serverDesigns() ?? [];
    const match = designs.find((d) => d.id === id);
    if (match) {
      const cfg = toPresetConfig(match);
      setCustomConfig(cfg);
      loadLayoutFromDesign(match, cfg.labelWidthMM, cfg.labelHeightMM);
    }
    return;
  }
  if (key === 'custom') {
    setCustomConfig({ ...PRESETS.custom });
  }
}

export function getEffectiveConfig(): PresetConfig {
  const pk = presetKey();
  if (pk === 'custom') {
    return customConfig();
  }
  if (pk.startsWith('server-')) {
    const id = parseInt(pk.slice(7), 10);
    const designs = serverDesigns() ?? [];
    const match = designs.find((d) => d.id === id);
    if (match) {
      const cfg = customConfig();
      if (cfg.name === match.name || cfg.name === '') {
        return cfg;
      }
      return toPresetConfig(match);
    }
    return PRESETS['tj-108'];
  }
  return PRESETS[pk] || PRESETS['tj-108'];
}

