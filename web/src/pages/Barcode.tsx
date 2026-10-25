import { type Component, createSignal, onMount, Show, For, createMemo } from 'solid-js';
import {
  isLoginModalOpen,
  refreshStatus,
  setIsLoginModalOpen,
  status,
} from '~/stores/accurateAuth';
import {
  addItem,
  clearItems,
  deleteItem,
  items,
  toggleSelectAll,
  updateItemField,
} from '~/stores/barcodeItems';
import {
  barcodeHeight,
  companyName,
  customConfig,
  fontSize,
  getEffectiveConfig,
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
import type { BarcodeHeight, FontSize, Symbology } from '~/types';
import { PrintPreview } from '~/components/barcode/PrintPreview';
import { AccurateLoginModal } from '~/components/barcode/AccurateLoginModal';
import { ItemSearchDrawer } from '~/components/barcode/ItemSearchDrawer';
import { TransactionDrawer } from '~/components/barcode/TransactionDrawer';
import { PasteModal } from '~/components/barcode/PasteModal';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import { DataTable } from '~/components/DataTable';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import {
  IconBarcode,
  IconPrinter,
  IconPlus,
  IconTrash,
  IconClipboard,
  IconPackage,
  IconFileInvoice,
  IconScan,
  IconPlugConnected,
  IconPlugConnectedX,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-solidjs';

export const Barcode: Component = () => {
  const [isInspectorOpen, setIsInspectorOpen] = createSignal(true);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [isTransactionOpen, setIsTransactionOpen] = createSignal(false);
  const [isPasteOpen, setIsPasteOpen] = createSignal(false);
  const [scanInput, setScanInput] = createSignal('');
  const [filterQuery, setFilterQuery] = createSignal('');

  onMount(() => {
    void refreshStatus();
  });

  const selectedItems = createMemo(() => items().filter((it) => it.selected));
  const totalLabels = createMemo(() => {
    if (qtyMode() === 'multiply') {
      return selectedItems().reduce((acc, it) => acc + (it.quantity > 0 ? it.quantity : 1), 0);
    }
    return selectedItems().length;
  });

  const filteredItems = createMemo(() => {
    const q = filterQuery().trim().toLowerCase();
    if (!q) return items();
    return items().filter(
      (it) =>
        it.itemNo.toLowerCase().includes(q) ||
        it.itemName.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q)
    );
  });

  const isAllSelected = createMemo(
    () => items().length > 0 && selectedItems().length === items().length
  );

  const handleScanSubmit = (e: Event) => {
    e.preventDefault();
    const val = scanInput().trim();
    if (!val) return;
    addItem({
      itemNo: val,
      itemName: `Item ${val}`,
      barcode: val,
      quantity: 1,
    });
    setScanInput('');
  };

  return (
    <div class="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header bar styled like app pages */}
      <header class="no-print h-14 border-b bg-card px-4 md:px-6 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <IconBarcode class="size-5 text-primary" />
            <h1 class="text-sm font-bold tracking-tight text-foreground">
              Barcode Printing Workspace
            </h1>
          </div>

          <Show
            when={status().enabled}
            fallback={
              <Badge variant="outline" class="text-xs text-muted-foreground border-dashed">
                Offline Mode
              </Badge>
            }
          >
            <Show
              when={status().connected}
              fallback={
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  <IconPlugConnectedX class="size-3" />
                  <span>Accurate Disconnected</span>
                </button>
              }
            >
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                <IconPlugConnected class="size-3" />
                <span class="truncate max-w-[140px] font-semibold">
                  {status().database?.alias || 'Connected'}
                </span>
              </button>
            </Show>
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsInspectorOpen(!isInspectorOpen())}
            class="h-8 text-xs gap-1.5"
          >
            <Show when={isInspectorOpen()} fallback={<IconEye class="size-4" />}>
              <IconEyeOff class="size-4" />
            </Show>
            <span>{isInspectorOpen() ? 'Hide Inspector' : 'Show Inspector'}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => window.print()}
            disabled={selectedItems().length === 0}
            class="h-8 gap-1.5"
          >
            <IconPrinter class="size-4" />
            <span>Print Labels ({totalLabels()})</span>
          </Button>
        </div>
      </header>

      {/* Main Split Layout: Left/Center Content + Right Inspector */}
      <div class="flex-1 flex overflow-hidden">
        {/* Main Content Area (Scrolls vertically: Filter -> Items Table -> Print Preview) */}
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Card 1: Filter & Quick Action Toolbar (Items Page Pattern) */}
          <Card>
            <CardContent class="p-4 md:p-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-4">
                {/* Barcode Quick Scan */}
                <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[220px]">
                  <form onSubmit={handleScanSubmit}>
                    <TextField value={scanInput()} onChange={setScanInput}>
                      <TextFieldLabel class="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <IconScan class="size-3 text-primary" />
                        Quick Scan / Add Barcode
                      </TextFieldLabel>
                      <TextFieldInput
                        placeholder="Scan or type barcode (Enter to add)..."
                        class="h-9 w-full font-mono text-xs"
                      />
                    </TextField>
                  </form>
                </div>

                {/* Filter Table Rows */}
                <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[200px]">
                  <TextField value={filterQuery()} onChange={setFilterQuery}>
                    <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                      Filter Queued Rows
                    </TextFieldLabel>
                    <TextFieldInput
                      placeholder="Search code, name, barcode..."
                      class="h-9 w-full text-xs"
                    />
                  </TextField>
                </div>

                {/* Import Buttons Group */}
                <div class="flex items-center gap-2 flex-wrap pt-2 sm:pt-0">
                  <Button size="sm" onClick={() => addItem()} class="h-9 gap-1 text-xs">
                    <IconPlus class="size-3.5" />
                    <span>Add Row</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPasteOpen(true)}
                    class="h-9 gap-1 text-xs"
                  >
                    <IconClipboard class="size-3.5" />
                    <span>Paste Excel/CSV</span>
                  </Button>

                  <Show when={status().connected}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSearchOpen(true)}
                      class="h-9 gap-1 text-xs"
                    >
                      <IconPackage class="size-3.5" />
                      <span>Accurate Items</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTransactionOpen(true)}
                      class="h-9 gap-1 text-xs"
                    >
                      <IconFileInvoice class="size-3.5" />
                      <span>Load PO / DO</span>
                    </Button>
                  </Show>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Queued Items Table (Top Section styled like Items Table Card) */}
          <Card>
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle class="text-base font-semibold">Print Queue Items</CardTitle>
                <CardDescription>
                  {items().length.toLocaleString()} total queued line items • {selectedItems().length} selected for printing ({totalLabels()} labels)
                </CardDescription>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAll(!isAllSelected())}
                  class="text-xs h-8"
                >
                  {isAllSelected() ? 'Deselect All' : 'Select All'}
                </Button>

                <Show when={items().length > 0}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearItems}
                    class="text-xs h-8 text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <IconTrash class="size-3.5" />
                    <span>Clear All</span>
                  </Button>
                </Show>
              </div>
            </CardHeader>

            <CardContent class="p-4 md:p-6 pt-0 space-y-4">
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected()}
                        onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
                        class="rounded border-border text-primary"
                      />
                    </TableHead>
                    <TableHead class="w-32">Item Code</TableHead>
                    <TableHead class="min-w-[180px]">Item Name</TableHead>
                    <TableHead class="w-36">Barcode / UPC</TableHead>
                    <TableHead class="w-28 text-center">Quantity</TableHead>
                    <TableHead class="w-20 text-center">Unit</TableHead>
                    <TableHead class="w-28 text-right">Price</TableHead>
                    <TableHead class="w-12 text-center"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={filteredItems()}>
                    {(item) => (
                      <TableRow class={item.selected ? '' : 'opacity-40'}>
                        <TableCell class="text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) =>
                              updateItemField(item.id, 'selected', e.currentTarget.checked)
                            }
                            class="rounded border-border text-primary cursor-pointer"
                          />
                        </TableCell>
                        <TableCell class="p-2">
                          <input
                            type="text"
                            value={item.itemNo}
                            onInput={(e) =>
                              updateItemField(item.id, 'itemNo', e.currentTarget.value)
                            }
                            class="w-full px-2 py-1 text-xs font-mono font-medium border rounded bg-background"
                          />
                        </TableCell>
                        <TableCell class="p-2">
                          <input
                            type="text"
                            value={item.itemName}
                            onInput={(e) =>
                              updateItemField(item.id, 'itemName', e.currentTarget.value)
                            }
                            class="w-full px-2 py-1 text-xs border rounded bg-background"
                          />
                        </TableCell>
                        <TableCell class="p-2">
                          <input
                            type="text"
                            value={item.barcode}
                            onInput={(e) =>
                              updateItemField(item.id, 'barcode', e.currentTarget.value)
                            }
                            class="w-full px-2 py-1 text-xs font-mono border rounded bg-background"
                          />
                        </TableCell>
                        <TableCell class="p-2 text-center">
                          <div class="inline-flex items-center border rounded bg-background">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemField(item.id, 'quantity', Math.max(1, item.quantity - 1))
                              }
                              class="px-2 py-1 text-muted-foreground hover:text-foreground text-xs font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onInput={(e) =>
                                updateItemField(
                                  item.id,
                                  'quantity',
                                  parseInt(e.currentTarget.value, 10) || 1
                                )
                              }
                              class="w-12 text-center font-semibold text-xs bg-transparent focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateItemField(item.id, 'quantity', item.quantity + 1)
                              }
                              class="px-2 py-1 text-muted-foreground hover:text-foreground text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </TableCell>
                        <TableCell class="p-2 text-center">
                          <input
                            type="text"
                            value={item.unit}
                            onInput={(e) =>
                              updateItemField(item.id, 'unit', e.currentTarget.value)
                            }
                            class="w-16 px-1.5 py-1 text-xs text-center border rounded bg-background"
                          />
                        </TableCell>
                        <TableCell class="p-2 text-right">
                          <input
                            type="number"
                            step={500}
                            value={item.price}
                            onInput={(e) =>
                              updateItemField(item.id, 'price', parseFloat(e.currentTarget.value) || 0)
                            }
                            class="w-24 px-1.5 py-1 text-xs text-right border rounded bg-background"
                          />
                        </TableCell>
                        <TableCell class="text-center p-2">
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            class="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                            title="Delete row"
                          >
                            <IconTrash class="size-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )}
                  </For>

                  <Show when={filteredItems().length === 0}>
                    <TableRow>
                      <TableCell colspan={8} class="h-32 text-center text-muted-foreground text-xs">
                        {filterQuery()
                          ? 'No items match your filter keyword.'
                          : 'No items in the print queue. Scan barcode or use the import actions above.'}
                      </TableCell>
                    </TableRow>
                  </Show>
                </TableBody>
              </DataTable>
            </CardContent>
          </Card>

          {/* Card 3: Live Print Preview Canvas (After the list) */}
          <Card class="overflow-hidden">
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4 border-b">
              <div>
                <CardTitle class="text-base font-semibold flex items-center gap-2">
                  <IconPrinter class="size-5 text-primary" />
                  Print Preview Canvas
                </CardTitle>
                <CardDescription>
                  Rendering {selectedItems().length} selected items ({totalLabels()} labels) on {getEffectiveConfig().name}
                </CardDescription>
              </div>

              <div class="flex items-center gap-3">
                <Button size="sm" onClick={() => window.print()} disabled={selectedItems().length === 0}>
                  <IconPrinter class="size-4 mr-1.5" />
                  Print Now
                </Button>
              </div>
            </CardHeader>

            <CardContent class="p-0 bg-muted/20 min-h-[480px] flex flex-col">
              <PrintPreview />
            </CardContent>
          </Card>
        </div>

        {/* Right Dock: Inspector Palette */}
        <Show when={isInspectorOpen()}>
          <aside class="no-print w-80 border-l bg-card flex flex-col shrink-0 overflow-y-auto p-4 space-y-5 text-xs">
            <div class="flex items-center justify-between border-b pb-2">
              <span class="font-bold text-xs uppercase tracking-wider text-foreground">
                Label & Paper Inspector
              </span>
              <button
                type="button"
                onClick={() => setIsInspectorOpen(false)}
                class="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            {/* 1. Paper & Preset */}
            <div class="space-y-1.5">
              <label class="block font-semibold text-muted-foreground text-[11px] uppercase">
                Sticker Paper Preset
              </label>
              <select
                value={presetKey()}
                onChange={(e) => selectPreset(e.currentTarget.value)}
                class="w-full text-xs px-2.5 py-1.5 border rounded-md bg-background font-medium"
              >
                <For each={Object.entries(PRESETS)}>
                  {([k, p]) => <option value={k}>{p.name}</option>}
                </For>
              </select>
            </div>

            {/* Custom Dimensions if selected */}
            <Show when={presetKey() === 'custom'}>
              <div class="p-3 bg-muted/40 border rounded-lg space-y-2 text-[11px]">
                <div class="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                  Custom Dimensions (mm)
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-muted-foreground">Width (mm)</label>
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
                    <label class="block text-muted-foreground">Height (mm)</label>
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
                    <label class="block text-muted-foreground">Columns</label>
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
                    <label class="block text-muted-foreground">Rows</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customConfig().rows}
                      onInput={(e) =>
                        setCustomConfig({
                          ...customConfig(),
                          rows: parseInt(e.currentTarget.value, 10) || 1,
                        })
                      }
                      class="w-full px-2 py-1 border rounded bg-background"
                    />
                  </div>
                </div>
              </div>
            </Show>

            {/* 2. Symbology & Dimensions */}
            <div class="space-y-2 border-t pt-3">
              <label class="block font-semibold text-muted-foreground text-[11px] uppercase">
                Symbology & Sizing
              </label>
              <select
                value={symbology()}
                onChange={(e) => setSymbology(e.currentTarget.value as Symbology)}
                class="w-full text-xs px-2.5 py-1.5 border rounded-md bg-background"
              >
                <option value="CODE128">Code 128 (Standard)</option>
                <option value="CODE39">Code 39</option>
                <option value="EAN13">EAN-13 (13 digits)</option>
                <option value="QRCODE">QR Code (2D)</option>
              </select>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label class="block text-[10px] text-muted-foreground">Barcode Height</label>
                  <select
                    value={barcodeHeight()}
                    onChange={(e) => setBarcodeHeight(e.currentTarget.value as BarcodeHeight)}
                    class="w-full text-xs px-2 py-1 border rounded bg-background"
                  >
                    <option value="compact">Compact (18px)</option>
                    <option value="medium">Medium (24px)</option>
                    <option value="large">Large (32px)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] text-muted-foreground">Font Size</label>
                  <select
                    value={fontSize()}
                    onChange={(e) => setFontSize(e.currentTarget.value as FontSize)}
                    class="w-full text-xs px-2 py-1 border rounded bg-background"
                  >
                    <option value="small">Small (0.55rem)</option>
                    <option value="medium">Medium (0.65rem)</option>
                    <option value="large">Large (0.75rem)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Quantity Mode & Skip */}
            <div class="space-y-2 border-t pt-3">
              <label class="block font-semibold text-muted-foreground text-[11px] uppercase">
                Quantity Mode & Offset
              </label>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setQtyMode('multiply')}
                  class={`py-1.5 rounded border text-xs font-medium transition-colors ${
                    qtyMode() === 'multiply'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  By Qty (N labels)
                </button>
                <button
                  type="button"
                  onClick={() => setQtyMode('single')}
                  class={`py-1.5 rounded border text-xs font-medium transition-colors ${
                    qtyMode() === 'single'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  Single (1 label)
                </button>
              </div>

              <div class="pt-1">
                <label class="block text-[10px] text-muted-foreground mb-0.5">
                  Skip Used Slots on Sheet
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={skipCount()}
                  onInput={(e) => setSkipCount(parseInt(e.currentTarget.value, 10) || 0)}
                  class="w-full px-2 py-1 text-xs border rounded bg-background font-mono"
                />
              </div>
            </div>

            {/* 4. Label Elements Toggles */}
            <div class="space-y-2 border-t pt-3">
              <label class="block font-semibold text-muted-foreground text-[11px] uppercase">
                Label Elements
              </label>
              <div class="space-y-1.5 text-xs">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBarcodeImg()}
                    onChange={(e) => setShowBarcodeImg(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Barcode Graphic</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBarcodeTxt()}
                    onChange={(e) => setShowBarcodeTxt(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Barcode Text</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showName()}
                    onChange={(e) => setShowName(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Item Name</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCode()}
                    onChange={(e) => setShowCode(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Item Code</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice()}
                    onChange={(e) => setShowPrice(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Price</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showUnit()}
                    onChange={(e) => setShowUnit(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Unit</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCompany()}
                    onChange={(e) => setShowCompany(e.currentTarget.checked)}
                    class="rounded border-border text-primary"
                  />
                  <span>Header / Company Name</span>
                </label>
              </div>

              <Show when={showCompany()}>
                <input
                  type="text"
                  value={companyName()}
                  onInput={(e) => setCompanyName(e.currentTarget.value)}
                  placeholder="Company Name"
                  class="w-full px-2 py-1 text-xs border rounded bg-background mt-1"
                />
              </Show>
            </div>

            {/* 5. View Controls */}
            <div class="space-y-2 border-t pt-3">
              <label class="block font-semibold text-muted-foreground text-[11px] uppercase">
                Canvas Settings
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={showScreenBorder()}
                  onChange={(e) => setShowScreenBorder(e.currentTarget.checked)}
                  class="rounded border-border text-primary"
                />
                <span>Screen Dashed Grid Lines</span>
              </label>

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
          </aside>
        </Show>
      </div>

      <AccurateLoginModal />
      <ItemSearchDrawer isOpen={isSearchOpen()} onClose={() => setIsSearchOpen(false)} />
      <TransactionDrawer isOpen={isTransactionOpen()} onClose={() => setIsTransactionOpen(false)} />
      <PasteModal isOpen={isPasteOpen()} onClose={() => setIsPasteOpen(false)} />
    </div>
  );
};
