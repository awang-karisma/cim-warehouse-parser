import { createSignal } from 'solid-js';
import type { BarcodeHeight, FontSize, PresetConfig, QtyMode, Symbology } from '~/types';

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

export const [showBarcodeImg, setShowBarcodeImg] = createSignal<boolean>(true);
export const [showBarcodeTxt, setShowBarcodeTxt] = createSignal<boolean>(true);
export const [showName, setShowName] = createSignal<boolean>(true);
export const [showCode, setShowCode] = createSignal<boolean>(true);
export const [showPrice, setShowPrice] = createSignal<boolean>(true);
export const [showUnit, setShowUnit] = createSignal<boolean>(true);
export const [showCompany, setShowCompany] = createSignal<boolean>(false);
export const [companyName, setCompanyName] = createSignal<string>('WAREHOUSE');

export const [showScreenBorder, setShowScreenBorder] = createSignal<boolean>(true);
export const [zoom, setZoom] = createSignal<number>(1.0);

export function selectPreset(key: string): void {
  if (PRESETS[key]) {
    setPresetKey(key);
    if (key === 'custom') {
      setCustomConfig({ ...PRESETS.custom });
    }
  }
}

export function getEffectiveConfig(): PresetConfig {
  const pk = presetKey();
  if (pk === 'custom') {
    return customConfig();
  }
  return PRESETS[pk] || PRESETS['tj-108'];
}
