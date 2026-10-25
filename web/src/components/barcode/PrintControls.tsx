import { type Component, For, Show } from 'solid-js';
import {
  barcodeHeight,
  companyName,
  customConfig,
  fontSize,
  PRESETS,
  presetKey,
  qtyMode,
  selectPreset,
  setBarcodeHeight,
  setCompanyName,
  setCustomConfig,
  setFontSize,
  setQtyMode,
  setShowBarcodeImg,
  setShowBarcodeTxt,
  setShowCode,
  setShowCompany,
  setShowName,
  setShowPrice,
  setShowScreenBorder,
  setShowUnit,
  setSkipCount,
  setSymbology,
  setZoom,
  showBarcodeImg,
  showBarcodeTxt,
  showCode,
  showCompany,
  showName,
  showPrice,
  showScreenBorder,
  showUnit,
  skipCount,
  symbology,
  zoom,
} from '~/stores/barcodeConfig';
import type { BarcodeHeight, FontSize, QtyMode, Symbology } from '~/types';

export const PrintControls: Component = () => {
  return (
    <div class="space-y-5 text-xs text-foreground p-1">
      {/* 1. Paper & Label Preset */}
      <div class="space-y-1.5">
        <label class="block font-semibold text-xs text-foreground">
          Paper & Sticker Preset
        </label>
        <select
          value={presetKey()}
          onChange={(e) => selectPreset(e.currentTarget.value)}
          class="w-full px-2.5 py-1.5 border rounded-md bg-background text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <For each={Object.entries(PRESETS)}>
            {([key, p]) => <option value={key}>{p.name}</option>}
          </For>
        </select>
      </div>

      {/* 2. Custom Layout Controls */}
      <Show when={presetKey() === 'custom'}>
        <div class="p-3 bg-muted/40 border rounded-lg space-y-2.5">
          <div class="font-semibold text-xs text-foreground uppercase tracking-wider">
            Custom Dimensions (mm)
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label class="block text-muted-foreground mb-0.5">Paper Type</label>
              <select
                value={customConfig().paper}
                onChange={(e) =>
                  setCustomConfig({ ...customConfig(), paper: e.currentTarget.value })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              >
                <option value="A4">A4 (210×297)</option>
                <option value="Letter">Letter (216×279)</option>
                <option value="Roll">Roll Continuous</option>
              </select>
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Columns</label>
              <input
                type="number"
                min={1}
                max={10}
                value={customConfig().cols}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    cols: parseInt(e.currentTarget.value, 10) || 1,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Label Width (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().labelWidthMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    labelWidthMM: parseFloat(e.currentTarget.value) || 10,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Label Height (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().labelHeightMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    labelHeightMM: parseFloat(e.currentTarget.value) || 10,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Horiz. Gap (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().gapXMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    gapXMM: parseFloat(e.currentTarget.value) || 0,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Vert. Gap (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().gapYMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    gapYMM: parseFloat(e.currentTarget.value) || 0,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Top Margin (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().marginTopMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    marginTopMM: parseFloat(e.currentTarget.value) || 0,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-0.5">Left Margin (mm)</label>
              <input
                type="number"
                step="0.5"
                value={customConfig().marginLeftMM}
                onInput={(e) =>
                  setCustomConfig({
                    ...customConfig(),
                    marginLeftMM: parseFloat(e.currentTarget.value) || 0,
                  })
                }
                class="w-full px-2 py-1 border rounded bg-background"
              />
            </div>
          </div>
        </div>
      </Show>

      {/* 3. Quantity Mode */}
      <div class="space-y-1.5">
        <label class="block font-semibold text-xs text-foreground">
          Quantity Mode
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setQtyMode('multiply')}
            class={`px-3 py-2 text-xs rounded-md border font-medium transition-colors ${
              qtyMode() === 'multiply'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-muted text-foreground'
            }`}
          >
            By Quantity (N labels)
          </button>
          <button
            type="button"
            onClick={() => setQtyMode('single')}
            class={`px-3 py-2 text-xs rounded-md border font-medium transition-colors ${
              qtyMode() === 'single'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-muted text-foreground'
            }`}
          >
            Single (1 per item)
          </button>
        </div>
      </div>

      {/* 4. Symbology & Dimensions */}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-foreground">Symbology</label>
          <select
            value={symbology()}
            onChange={(e) => setSymbology(e.currentTarget.value as Symbology)}
            class="w-full px-2.5 py-1.5 border rounded-md bg-background text-xs"
          >
            <option value="CODE128">Code 128 (Standard)</option>
            <option value="CODE39">Code 39</option>
            <option value="EAN13">EAN-13 (13 digits)</option>
            <option value="QRCODE">QR Code (2D)</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-foreground">Barcode Height</label>
          <select
            value={barcodeHeight()}
            onChange={(e) => setBarcodeHeight(e.currentTarget.value as BarcodeHeight)}
            class="w-full px-2.5 py-1.5 border rounded-md bg-background text-xs"
          >
            <option value="compact">Compact (18px)</option>
            <option value="medium">Medium (24px)</option>
            <option value="large">Large (32px)</option>
          </select>
        </div>
      </div>

      {/* 5. Font Size & Skip Count */}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-foreground">Text Font Size</label>
          <select
            value={fontSize()}
            onChange={(e) => setFontSize(e.currentTarget.value as FontSize)}
            class="w-full px-2.5 py-1.5 border rounded-md bg-background text-xs"
          >
            <option value="small">Small (0.55rem)</option>
            <option value="medium">Medium (0.65rem)</option>
            <option value="large">Large (0.75rem)</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-foreground">Skip Slots</label>
          <input
            type="number"
            min={0}
            max={50}
            value={skipCount()}
            onInput={(e) => setSkipCount(parseInt(e.currentTarget.value, 10) || 0)}
            class="w-full px-2.5 py-1.5 border rounded-md bg-background text-xs"
          />
        </div>
      </div>

      {/* 6. Label Content Visibility Toggles */}
      <div class="space-y-2 border-t pt-3">
        <label class="block text-xs font-semibold text-foreground">
          Label Content Elements
        </label>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBarcodeImg()}
              onChange={(e) => setShowBarcodeImg(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Barcode Graphic</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBarcodeTxt()}
              onChange={(e) => setShowBarcodeTxt(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Barcode Text</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showName()}
              onChange={(e) => setShowName(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Item Name</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCode()}
              onChange={(e) => setShowCode(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Item Code</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPrice()}
              onChange={(e) => setShowPrice(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Price</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showUnit()}
              onChange={(e) => setShowUnit(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Unit</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer col-span-2">
            <input
              type="checkbox"
              checked={showCompany()}
              onChange={(e) => setShowCompany(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Header / Company Name</span>
          </label>
        </div>

        <Show when={showCompany()}>
          <div class="pt-1">
            <input
              type="text"
              value={companyName()}
              onInput={(e) => setCompanyName(e.currentTarget.value)}
              placeholder="Company or Warehouse Name"
              class="w-full px-2.5 py-1.5 text-xs border rounded-md bg-background"
            />
          </div>
        </Show>
      </div>

      {/* 7. Screen View Controls */}
      <div class="space-y-2 border-t pt-3">
        <label class="block text-xs font-semibold text-foreground">
          Preview Screen Settings
        </label>
        <div class="flex items-center justify-between text-xs">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showScreenBorder()}
              onChange={(e) => setShowScreenBorder(e.currentTarget.checked)}
              class="rounded border-border"
            />
            <span>Dashed Borders on Screen</span>
          </label>
        </div>

        <div class="space-y-1 pt-1">
          <div class="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Zoom Scale</span>
            <span>{Math.round(zoom() * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={zoom()}
            onInput={(e) => setZoom(parseFloat(e.currentTarget.value))}
            class="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
