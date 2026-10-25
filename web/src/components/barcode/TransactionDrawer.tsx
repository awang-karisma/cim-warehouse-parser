import { type Component, createEffect, createSignal, For, Show } from 'solid-js';
import * as api from '~/api';
import { handleSessionInvalidated } from '~/stores/accurateAuth';
import { addNormalizedItems } from '~/stores/barcodeItems';
import type { AccurateDocumentHeader, AccurateNormalizedItem, AccuratePagination, AccurateSourceInfo } from '~/types';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  IconSearch,
  IconLoader2,
  IconFileInvoice,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconArrowLeft,
} from '@tabler/icons-solidjs';

interface TransactionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TransactionDrawer: Component<TransactionDrawerProps> = (props) => {
  const [sources, setSources] = createSignal<AccurateSourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = createSignal<string>('receive-item');
  const [documents, setDocuments] = createSignal<AccurateDocumentHeader[]>([]);
  const [pagination, setPagination] = createSignal<AccuratePagination>({ page: 1, pageCount: 1, pageSize: 20, rowCount: 0 });
  const [selectedDoc, setSelectedDoc] = createSignal<AccurateDocumentHeader | null>(null);
  const [docItems, setDocItems] = createSignal<AccurateNormalizedItem[]>([]);
  const [selectedItemIndices, setSelectedItemIndices] = createSignal<Set<number>>(new Set());

  const [searchQuery, setSearchQuery] = createSignal('');
  const [fromDate, setFromDate] = createSignal('');
  const [toDate, setToDate] = createSignal('');

  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let listRequestToken = 0;
  let detailRequestToken = 0;

  createEffect(() => {
    if (props.isOpen) {
      void (async () => {
        try {
          const list = await api.getAccurateSources();
          setSources(list);
          let current = selectedSource();
          if (list.length > 0 && (!current || !list.some((s) => s.id === current))) {
            current = list[0].id;
            setSelectedSource(current);
          }
          if (current) {
            void fetchDocuments(current, 1);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to fetch transaction sources');
        }
      })();
    }
  });

  const fetchDocuments = async (sourceId: string, page = 1) => {
    if (!sourceId) return;

    const token = ++listRequestToken;
    setIsLoading(true);
    setError(null);
    setSelectedDoc(null);
    setDocItems([]);
    setSelectedItemIndices(new Set<number>());

    try {
      const res = await api.getAccurateSourceDocuments(sourceId, {
        q: searchQuery(),
        from: fromDate(),
        to: toDate(),
        page,
        pageSize: 20,
      });
      if (token !== listRequestToken) return;
      setDocuments(res.documents);
      setPagination(res.pagination);
    } catch (err) {
      if (token !== listRequestToken) return;
      if (err instanceof api.ApiError && err.status === 401) {
        handleSessionInvalidated(err.message);
      }
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      if (token === listRequestToken) {
        setIsLoading(false);
      }
    }
  };

  const handleSelectDoc = async (doc: AccurateDocumentHeader) => {
    const currentSource = selectedSource();
    setSelectedDoc(doc);
    setIsLoading(true);
    setError(null);
    setDocItems([]);
    setSelectedItemIndices(new Set<number>());

    const token = ++detailRequestToken;
    try {
      const items = await api.getAccurateSourceDocumentItems(currentSource, doc.id);
      if (token !== detailRequestToken || selectedSource() !== currentSource) return;
      setDocItems(items);
      setSelectedItemIndices(new Set(items.map((_, i) => i)));
    } catch (err) {
      if (token !== detailRequestToken || selectedSource() !== currentSource) return;
      if (err instanceof api.ApiError && err.status === 401) {
        handleSessionInvalidated(err.message);
      }
      setError(err instanceof Error ? err.message : 'Failed to load document line items');
    } finally {
      if (token === detailRequestToken) {
        setIsLoading(false);
      }
    }
  };

  const handleAddItems = () => {
    const selected = docItems().filter((_, i) => selectedItemIndices().has(i));
    addNormalizedItems(selected);
    props.onClose();
  };

  return (
    <Sheet open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent position="right" class="w-full sm:max-w-2xl flex flex-col p-0">
        <div class="px-6 py-4 border-b bg-card">
          <SheetHeader>
            <SheetTitle class="text-base flex items-center gap-2">
              <IconFileInvoice class="size-5 text-primary" />
              Load Accurate Transaction Documents
            </SheetTitle>
            <SheetDescription class="text-xs">
              Import line items from Purchase Orders, Receive Items, Sales Orders, Deliveries, or Stock Opnames.
            </SheetDescription>
          </SheetHeader>

          {/* Source Tabs */}
          <div class="mt-4 flex flex-wrap gap-1.5">
            <For each={sources()}>
              {(src) => {
                const isSelected = selectedSource() === src.id;
                return (
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    disabled={!src.available}
                    onClick={() => {
                      setSelectedSource(src.id);
                      setSelectedDoc(null);
                      setDocItems([]);
                      setSelectedItemIndices(new Set<number>());
                      void fetchDocuments(src.id, 1);
                    }}
                    class="text-xs h-8"
                  >
                    {src.name.split(' (')[0]}
                  </Button>
                );
              }}
            </For>
          </div>

          {/* Filter Bar (only when document is not selected) */}
          <Show when={!selectedDoc()}>
            <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="relative sm:col-span-1">
                <input
                  type="text"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchDocuments(selectedSource(), 1);
                  }}
                  placeholder="Doc number / note..."
                  class="w-full px-2.5 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <input
                type="text"
                placeholder="From: DD/MM/YYYY"
                value={fromDate()}
                onInput={(e) => setFromDate(e.currentTarget.value)}
                class="px-2.5 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="To: DD/MM/YYYY"
                  value={toDate()}
                  onInput={(e) => setToDate(e.currentTarget.value)}
                  class="flex-1 px-2.5 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button size="sm" onClick={() => void fetchDocuments(selectedSource(), 1)} disabled={isLoading()}>
                  <IconSearch class="size-3.5" />
                </Button>
              </div>
            </div>
          </Show>
        </div>

        {/* Content Pane */}
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <Show when={error()}>
            <div class="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-md text-xs">
              {error()}
            </div>
          </Show>

          <Show
            when={!isLoading()}
            fallback={
              <div class="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                <IconLoader2 class="size-6 animate-spin text-primary" />
                <span>Loading Accurate data...</span>
              </div>
            }
          >
            {/* View 1: Document Details */}
            <Show
              when={selectedDoc()}
              fallback={
                /* View 2: Documents List */
                <Show
                  when={documents().length > 0}
                  fallback={
                    <div class="py-16 text-center text-muted-foreground text-xs">
                      No documents found for this source or search filters.
                    </div>
                  }
                >
                  <div class="border rounded-md overflow-hidden bg-card">
                    <table class="w-full text-xs text-left">
                      <thead class="bg-muted/50 border-b text-muted-foreground font-medium">
                        <tr>
                          <th class="p-2.5">Doc Number</th>
                          <th class="p-2.5">Date</th>
                          <th class="p-2.5">Description</th>
                          <th class="p-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border">
                        <For each={documents()}>
                          {(doc) => (
                            <tr
                              class="hover:bg-muted/40 cursor-pointer transition-colors"
                              onClick={() => void handleSelectDoc(doc)}
                            >
                              <td class="p-2.5 font-mono text-[11px] font-semibold text-primary">
                                {doc.number}
                              </td>
                              <td class="p-2.5 text-muted-foreground">{doc.date || '-'}</td>
                              <td class="p-2.5 text-foreground max-w-xs truncate">
                                {doc.description || '-'}
                              </td>
                              <td class="p-2.5 text-right">
                                <Badge variant="secondary" class="text-[10px]">
                                  {doc.statusName || 'Active'}
                                </Badge>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div class="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span>
                      Page {pagination().page} of {pagination().pageCount || 1} ({pagination().rowCount} total)
                    </span>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination().page <= 1 || isLoading()}
                        onClick={() => void fetchDocuments(selectedSource(), pagination().page - 1)}
                      >
                        <IconChevronLeft class="size-3.5 mr-1" /> Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination().page >= pagination().pageCount || isLoading()}
                        onClick={() => void fetchDocuments(selectedSource(), pagination().page + 1)}
                      >
                        Next <IconChevronRight class="size-3.5 ml-1" />
                      </Button>
                    </div>
                  </div>
                </Show>
              }
            >
              {(doc) => (
                <div class="space-y-3">
                  <div class="flex items-center justify-between bg-muted/40 p-3 rounded-lg border">
                    <div>
                      <div class="font-bold text-sm text-foreground">{doc().number}</div>
                      <div class="text-[11px] text-muted-foreground">
                        Date: {doc().date || '-'} • Status: {doc().statusName || '-'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDoc(null);
                        setDocItems([]);
                        setSelectedItemIndices(new Set<number>());
                      }}
                    >
                      <IconArrowLeft class="size-3.5 mr-1" /> Back to Documents
                    </Button>
                  </div>

                  {/* Items in document */}
                  <div class="border rounded-md overflow-hidden bg-card">
                    <table class="w-full text-xs text-left">
                      <thead class="bg-muted/50 border-b text-muted-foreground font-medium">
                        <tr>
                          <th class="p-2.5 w-8 text-center">
                            <input
                              type="checkbox"
                              checked={docItems().length > 0 && selectedItemIndices().size === docItems().length}
                              onChange={(e) => {
                                if (e.currentTarget.checked) {
                                  setSelectedItemIndices(new Set(docItems().map((_, i) => i)));
                                } else {
                                  setSelectedItemIndices(new Set<number>());
                                }
                              }}
                              class="rounded border-border"
                            />
                          </th>
                          <th class="p-2.5">Item Code</th>
                          <th class="p-2.5">Item Name</th>
                          <th class="p-2.5">Barcode / UPC</th>
                          <th class="p-2.5 text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border">
                        <For each={docItems()}>
                          {(item, idx) => {
                            const isChecked = selectedItemIndices().has(idx());
                            return (
                              <tr
                                class={`hover:bg-muted/40 cursor-pointer transition-colors ${
                                  isChecked ? 'bg-primary/5' : ''
                                }`}
                                onClick={() => {
                                  const next = new Set(selectedItemIndices());
                                  if (next.has(idx())) next.delete(idx());
                                  else next.add(idx());
                                  setSelectedItemIndices(next);
                                }}
                              >
                                <td class="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      const next = new Set(selectedItemIndices());
                                      if (next.has(idx())) next.delete(idx());
                                      else next.add(idx());
                                      setSelectedItemIndices(next);
                                    }}
                                    class="rounded border-border"
                                  />
                                </td>
                                <td class="p-2.5 font-mono text-[11px] font-medium">{item.itemNo}</td>
                                <td class="p-2.5 font-medium text-foreground">{item.itemName}</td>
                                <td class="p-2.5 font-mono text-[11px] text-muted-foreground">
                                  {item.upcNo || item.itemNo}
                                </td>
                                <td class="p-2.5 text-right font-medium">
                                  {item.quantity} {item.unitName}
                                </td>
                              </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Show>
          </Show>
        </div>

        {/* Footer */}
        <div class="p-4 border-t bg-card flex items-center justify-between">
          <Show
            when={selectedDoc()}
            fallback={
              <Button variant="outline" size="sm" onClick={props.onClose} class="ml-auto">
                Close
              </Button>
            }
          >
            <span class="text-xs text-muted-foreground">
              {selectedItemIndices().size} of {docItems().length} items selected
            </span>
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDoc(null);
                  setDocItems([]);
                  setSelectedItemIndices(new Set<number>());
                }}
              >
                Back
              </Button>
              <Button
                size="sm"
                disabled={selectedItemIndices().size === 0}
                onClick={handleAddItems}
              >
                <IconPlus class="size-4 mr-1.5" />
                Add Selected to Queue
              </Button>
            </div>
          </Show>
        </div>
      </SheetContent>
    </Sheet>
  );
};
