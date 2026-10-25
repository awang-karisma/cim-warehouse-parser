import { type Component, createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import * as api from '~/api';
import { status } from '~/stores/accurateAuth';
import {
  addItem,
  clearItems,
  deleteItem,
  items,
  toggleSelectAll,
  updateItemField,
} from '~/stores/barcodeItems';
import { qtyMode } from '~/stores/barcodeConfig';
import type { AccurateInventoryItem } from '~/types';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconClipboard,
  IconPackage,
  IconFileInvoice,
  IconScan,
  IconLoader2,
} from '@tabler/icons-solidjs';

interface BarcodeTableProps {
  onOpenSearch: () => void;
  onOpenTransaction: () => void;
  onOpenPaste: () => void;
}

export const BarcodeTable: Component<BarcodeTableProps> = (props) => {
  const selectedItems = () => items().filter((it) => it.selected);
  const totalLabels = () => {
    const isMultiply = qtyMode() === 'multiply';
    if (isMultiply) {
      return selectedItems().reduce((acc, it) => acc + (it.quantity > 0 ? it.quantity : 1), 0);
    }
    return selectedItems().length;
  };

  const isAllSelected = () => items().length > 0 && selectedItems().length === items().length;

  let searchInputRef: HTMLInputElement | undefined;
  let searchContainerRef: HTMLDivElement | undefined;
  let debounceTimer: number | undefined;
  let searchRequestId = 0;

  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal<AccurateInventoryItem[]>([]);
  const [searchMessage, setSearchMessage] = createSignal<string | null>(null);
  const [isSearching, setIsSearching] = createSignal(false);
  const [isPopupOpen, setIsPopupOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1);

  onCleanup(() => {
    clearTimeout(debounceTimer);
  });

  createEffect(() => {
    if (!isPopupOpen()) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef && !searchContainerRef.contains(e.target as Node)) {
        setIsPopupOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleOutsideClick);
    });
  });

  const addInventoryItemToList = (it: AccurateInventoryItem) => {
    addItem({
      itemNo: it.no,
      itemName: it.name,
      barcode: it.upcNo || it.no,
      quantity: 1,
      unit: it.unit1Name || 'Pcs',
      price: it.unitPrice ?? 0,
      documentType: 'Master Item',
      documentNumber: it.no,
    });
    setSearchQuery('');
    setSearchResults([]);
    setIsPopupOpen(false);
    setSearchMessage(null);
    setHighlightedIndex(-1);
    searchInputRef?.focus();
  };

  const executeSearch = async (q: string, fromEnter: boolean) => {
    const reqId = ++searchRequestId;
    setIsSearching(true);
    setSearchMessage(null);

    try {
      const res = await api.searchAccurateItems({ q, page: 1, pageSize: 50 });
      if (reqId !== searchRequestId) return;

      const all = res.items || [];
      const printable = all.filter((it) => it.canPrintBarcode);

      if (all.length === 0) {
        setSearchResults([]);
        setIsPopupOpen(false);
        setHighlightedIndex(-1);
        if (fromEnter) {
          setSearchMessage('Item not found in Accurate.');
        }
      } else if (printable.length === 0) {
        setSearchResults([]);
        setIsPopupOpen(false);
        setHighlightedIndex(-1);
        if (fromEnter) {
          setSearchMessage('No barcode-printable inventory items found.');
        }
      } else if (printable.length === 1 && fromEnter) {
        addInventoryItemToList(printable[0]);
      } else {
        setSearchResults(printable);
        setIsPopupOpen(true);
        setHighlightedIndex(0);
      }
    } catch {
      if (reqId !== searchRequestId) return;
      setSearchResults([]);
      setIsPopupOpen(false);
      setHighlightedIndex(-1);
      if (fromEnter) {
        setSearchMessage('Error searching Accurate items.');
      }
    } finally {
      if (reqId === searchRequestId) {
        setIsSearching(false);
      }
    }
  };

  const handleSearchInput = (e: InputEvent) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    setSearchQuery(val);
    clearTimeout(debounceTimer);

    if (val.trim().length >= 2 && status().connected) {
      debounceTimer = window.setTimeout(() => {
        void executeSearch(val.trim(), false);
      }, 250);
    } else {
      setSearchResults([]);
      setIsPopupOpen(false);
      setSearchMessage(null);
      setHighlightedIndex(-1);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      if (!isPopupOpen() || searchResults().length === 0) return;
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults().length);
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!isPopupOpen() || searchResults().length === 0) return;
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + searchResults().length) % searchResults().length);
      return;
    }

    if (e.key === 'Escape') {
      if (isPopupOpen()) {
        e.preventDefault();
        setIsPopupOpen(false);
        setHighlightedIndex(-1);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = searchQuery().trim();
      if (!val) return;

      const idx = highlightedIndex();
      if (isPopupOpen() && idx >= 0 && idx < searchResults().length) {
        addInventoryItemToList(searchResults()[idx]);
      } else if (status().connected) {
        void executeSearch(val, true);
      } else {
        addItem({
          itemNo: val,
          itemName: `Item ${val}`,
          barcode: val,
          quantity: 1,
        });
        setSearchQuery('');
        searchInputRef?.focus();
      }
    }
  };

  return (
    <div class="flex flex-col h-full space-y-3">
      {/* Top Action Toolbar */}
      <div class="flex flex-wrap items-center justify-between gap-2 bg-card p-3 rounded-lg border">
        {/* Quick Scan / Live Lookup */}
        <div ref={searchContainerRef} class="relative flex-1 min-w-[240px] max-w-md">
          <div class="relative">
            <IconScan class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery()}
              onInput={handleSearchInput}
              onKeyDown={handleSearchKeyDown}
              placeholder={status().connected ? 'Scan barcode or search Accurate item...' : 'Add barcode or item code directly...'}
              class="w-full pl-9 pr-8 py-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Show when={isSearching()}>
              <IconLoader2 class="absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground" />
            </Show>
          </div>

          <Show when={searchMessage()}>
            <div class="absolute left-0 right-0 top-full mt-1 p-2 bg-amber-50 text-amber-800 text-[11px] rounded border border-amber-200 z-30 shadow-md">
              {searchMessage()}
            </div>
          </Show>

          {/* Autocomplete Popup */}
          <Show when={isPopupOpen() && searchResults().length > 0}>
            <div class="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-xl z-50 divide-y divide-border text-xs">
              <For each={searchResults()}>
                {(it, idx) => (
                  <button
                    type="button"
                    onClick={() => addInventoryItemToList(it)}
                    class={`w-full text-left p-2.5 hover:bg-accent hover:text-accent-foreground flex items-center justify-between transition-colors ${
                      highlightedIndex() === idx() ? 'bg-accent text-accent-foreground' : ''
                    }`}
                  >
                    <div>
                      <div class="font-medium text-foreground">{it.name}</div>
                      <div class="text-[10px] text-muted-foreground font-mono">
                        {it.no} • {it.upcNo || 'No Barcode'}
                      </div>
                    </div>
                    <div class="text-right text-[11px] font-semibold text-primary">
                      {it.availableToSell} {it.unit1Name}
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" onClick={() => addItem()} class="h-8 text-xs">
            <IconPlus class="size-3.5 mr-1" />
            Add Row
          </Button>

          <Button variant="outline" size="sm" onClick={props.onOpenPaste} class="h-8 text-xs">
            <IconClipboard class="size-3.5 mr-1" />
            Paste Data
          </Button>

          <Show when={status().connected}>
            <Button variant="outline" size="sm" onClick={props.onOpenSearch} class="h-8 text-xs">
              <IconPackage class="size-3.5 mr-1" />
              Search Master
            </Button>
            <Button variant="outline" size="sm" onClick={props.onOpenTransaction} class="h-8 text-xs">
              <IconFileInvoice class="size-3.5 mr-1" />
              Load Transaction
            </Button>
          </Show>

          <Button
            variant="ghost"
            size="sm"
            onClick={clearItems}
            disabled={items().length === 0}
            class="h-8 text-xs text-destructive hover:bg-destructive/10"
          >
            <IconTrash class="size-3.5 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div class="flex-1 border rounded-lg overflow-x-auto bg-card">
        <table class="w-full text-xs text-left">
          <thead class="bg-muted/50 border-b text-muted-foreground font-medium">
            <tr>
              <th class="p-2.5 w-8 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected()}
                  onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
                  class="rounded border-border"
                />
              </th>
              <th class="p-2.5 w-28">Item Code</th>
              <th class="p-2.5 min-w-[160px]">Item Name</th>
              <th class="p-2.5 w-36">Barcode / UPC</th>
              <th class="p-2.5 w-20 text-center">Qty</th>
              <th class="p-2.5 w-16 text-center">Unit</th>
              <th class="p-2.5 w-24 text-right">Price</th>
              <th class="p-2.5 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <For each={items()}>
              {(item) => (
                <tr class={`hover:bg-muted/30 transition-colors ${item.selected ? '' : 'opacity-50'}`}>
                  <td class="p-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateItemField(item.id, 'selected', e.currentTarget.checked)}
                      class="rounded border-border"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="text"
                      value={item.itemNo}
                      onInput={(e) => updateItemField(item.id, 'itemNo', e.currentTarget.value)}
                      class="w-full px-2 py-1 text-xs font-mono font-medium border rounded bg-background"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="text"
                      value={item.itemName}
                      onInput={(e) => updateItemField(item.id, 'itemName', e.currentTarget.value)}
                      class="w-full px-2 py-1 text-xs border rounded bg-background"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="text"
                      value={item.barcode}
                      onInput={(e) => updateItemField(item.id, 'barcode', e.currentTarget.value)}
                      class="w-full px-2 py-1 text-xs font-mono border rounded bg-background"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onInput={(e) => updateItemField(item.id, 'quantity', parseInt(e.currentTarget.value, 10) || 1)}
                      class="w-full px-2 py-1 text-xs text-center border rounded bg-background"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="text"
                      value={item.unit}
                      onInput={(e) => updateItemField(item.id, 'unit', e.currentTarget.value)}
                      class="w-full px-2 py-1 text-xs text-center border rounded bg-background"
                    />
                  </td>
                  <td class="p-2">
                    <input
                      type="number"
                      step={500}
                      value={item.price}
                      onInput={(e) => updateItemField(item.id, 'price', parseFloat(e.currentTarget.value) || 0)}
                      class="w-full px-2 py-1 text-xs text-right border rounded bg-background"
                    />
                  </td>
                  <td class="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      class="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                      title="Delete row"
                    >
                      <IconTrash class="size-3.5" />
                    </button>
                  </td>
                </tr>
              )}
            </For>
            <Show when={items().length === 0}>
              <tr>
                <td colspan={8} class="text-center py-12 text-xs text-muted-foreground">
                  No items in the list. Use "Add Row", "Paste Data", or load a transaction to start.
                </td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div class="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div class="flex items-center gap-3">
          <span>{items().length} item rows</span>
          <span>•</span>
          <span class="font-medium text-foreground">{selectedItems().length} items selected</span>
          <Show when={selectedItems().length > 0}>
            <Badge variant="outline" class="font-mono text-xs">
              {totalLabels()} label{totalLabels() === 1 ? '' : 's'} to print
            </Badge>
          </Show>
        </div>
        <div class="text-[11px] text-muted-foreground">
          Quantity mode: <span class="font-semibold text-foreground uppercase">{qtyMode()}</span>
        </div>
      </div>
    </div>
  );
};
