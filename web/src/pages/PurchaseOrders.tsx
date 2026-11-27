import {
  type Component,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconRefresh,
  IconRotateClockwise,
  IconShoppingCart,
  IconUsers,
  IconX,
} from '@tabler/icons-solidjs';
import { getPurchaseOrders, subscribeSyncEvents } from '~/api';
import { Badge } from '~/components/Badge';
import { DataTable } from '~/components/DataTable';
import { DataTablePagination } from '~/components/data-table-pagination';
import { SortableTableHead } from '~/components/SortableTableHead';
import { TableSkeleton } from '~/components/TableSkeleton';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from '~/components/ui/table';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { SYNC_STATUS } from '~/domain';
import { useI18n } from '~/i18n';
import type { PurchaseOrderItem } from '~/types';
import { createUrlFilter } from '~/utils/tableFilters';
import type { SortDirection } from '~/utils/tableSorting';

const EMPTY_STATUS_TOKEN = '__EMPTY__';

interface SelectOption {
  value: string;
  label: string;
}

function isStockClient(name: string): boolean {
  const upper = name.trim().toUpperCase();
  return upper === 'STOK' || upper === 'STOCK';
}

export const PurchaseOrders: Component = () => {
  const { t, formatDate } = useI18n();
  const [searchDraft, setSearchDraft] = createSignal('');
  const [dockFilterOpen, setDockFilterOpen] = createSignal(false);
  let debounceTimer: number | undefined;

  const filters = createUrlFilter({
    q: {
      key: 'q',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
    },
    supplier: {
      key: 'supplier',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
    },
    status: {
      key: 'status',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
    },
    type: {
      key: 'type',
      defaultValue: 'all',
      parse: (v) => (v === 'client' || v === 'stock' ? v : 'all'),
      serialize: (v) => (v && v !== 'all' ? v : null),
    },
    sort: {
      key: 'sort',
      defaultValue: 'tanggal',
      parse: (v) => v || 'tanggal',
      serialize: (v) => (v && v !== 'tanggal' ? v : null),
    },
    order: {
      key: 'order',
      defaultValue: 'desc',
      parse: (v) => (v === 'asc' ? 'asc' : 'desc'),
      serialize: (v) => (v && v !== 'desc' ? v : null),
    },
    limit: {
      key: 'limit',
      defaultValue: 10,
      parse: (v) => {
        const n = parseInt(v ?? '10', 10);
        return isNaN(n) || n <= 0 ? 10 : n;
      },
      serialize: (v) => (v === 10 ? null : String(v)),
    },
    offset: {
      key: 'offset',
      defaultValue: 0,
      parse: (v) => {
        const n = parseInt(v ?? '0', 10);
        return isNaN(n) || n < 0 ? 0 : n;
      },
      serialize: (v) => (v === 0 ? null : String(v)),
    },
  });

  const activeFilterCount = createMemo(
    () =>
      Number(Boolean(filters.values.q())) +
      Number(filters.values.type() !== 'all') +
      Number(Boolean(filters.values.supplier())) +
      Number(Boolean(filters.values.status()))
  );

  onMount(() => {
    setSearchDraft(filters.values.q());
    const events = subscribeSyncEvents((event) => {
      if (event.status.toUpperCase() === SYNC_STATUS.SUCCESS) {
        void refetch();
      }
    });
    onCleanup(() => {
      window.clearTimeout(debounceTimer);
      events.close();
    });
  });

  const queryParams = createMemo(() => ({
    q: filters.values.q() || undefined,
    supplier: filters.values.supplier() || undefined,
    status: filters.values.status() || undefined,
    type: filters.values.type() === 'all' ? undefined : filters.values.type(),
    sort: filters.values.sort() || 'tanggal',
    order: filters.values.order() || 'desc',
    limit: filters.values.limit(),
    offset: filters.values.offset(),
  }));

  const [data, { refetch }] = createResource(queryParams, (params) => getPurchaseOrders(params));

  const handleSearchInput = (val: string) => {
    setSearchDraft(val);
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      filters.setters.q(val.trim());
      filters.setters.offset(0);
    }, 250);
  };

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    window.clearTimeout(debounceTimer);
    filters.setters.q(searchDraft().trim());
    filters.setters.offset(0);
  };

  const handleReset = () => {
    window.clearTimeout(debounceTimer);
    setSearchDraft('');
    filters.reset();
  };

  const handleSort = (field: string) => {
    if (filters.values.sort() === field) {
      filters.setters.order(filters.values.order() === 'asc' ? 'desc' : 'asc');
    } else {
      filters.setters.sort(field);
      filters.setters.order(field === 'tanggal' ? 'desc' : 'asc');
    }
    filters.setters.offset(0);
  };

  const getSortDirection = (field: string): SortDirection | undefined => {
    if (filters.values.sort() !== field) return undefined;
    return filters.values.order() === 'asc' ? 'asc' : 'desc';
  };

  const handleLimitChange = (newLimit: number) => {
    filters.setters.limit(newLimit);
    filters.setters.offset(0);
  };

  const typeOptions = createMemo<SelectOption[]>(() => [
    { value: 'all', label: t('purchaseOrders.typeAll') },
    { value: 'client', label: t('purchaseOrders.typeClient') },
    { value: 'stock', label: t('purchaseOrders.typeStock') },
  ]);

  const selectedTypeOption = createMemo(() => {
    const current = filters.values.type() || 'all';
    return typeOptions().find((opt) => opt.value === current) ?? typeOptions()[0];
  });

  const supplierOptions = createMemo<SelectOption[]>(() => {
    const list = data()?.suppliers ?? [];
    const current = filters.values.supplier();
    const values = current && !list.includes(current) ? [current, ...list] : list;
    return [
      { value: '', label: t('purchaseOrders.allSuppliers') },
      ...values.map((s) => ({ value: s, label: s })),
    ];
  });

  const selectedSupplierOption = createMemo(() => {
    const current = filters.values.supplier();
    return supplierOptions().find((opt) => opt.value === current) ?? supplierOptions()[0];
  });

  const statusOptions = createMemo<SelectOption[]>(() => {
    const list = data()?.statuses ?? [];
    const current = filters.values.status();
    const values =
      current && current !== EMPTY_STATUS_TOKEN && !list.includes(current)
        ? [current, ...list]
        : list;
    return [
      { value: '', label: t('purchaseOrders.allStatuses') },
      { value: EMPTY_STATUS_TOKEN, label: t('purchaseOrders.orderedNoUpdate') },
      ...values.map((s) => ({ value: s, label: s })),
    ];
  });

  const selectedStatusOption = createMemo(() => {
    const current = filters.values.status();
    return statusOptions().find((opt) => opt.value === current) ?? statusOptions()[0];
  });

  const formatRowDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return formatDate(new Date(year, month, day), {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return formatDate(dateStr);
  };

  const renderStatusBadge = (status: string) => {
    if (!status || !status.trim()) {
      return (
        <span class="inline-flex items-center rounded-md border border-status-proses/30 bg-status-proses/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-proses">
          {t('purchaseOrders.statusOrdered')}
        </span>
      );
    }
    return <Badge status={status} kind="item" />;
  };

  const renderClients = (item: PurchaseOrderItem) => {
    const list = item.clients ?? [];
    if (list.length === 0) {
      if (item.is_stock) {
        return (
          <span class="inline-flex items-center rounded-md border border-status-selesai/30 bg-status-selesai/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-selesai">
            {t('purchaseOrders.stockBadge')}
          </span>
        );
      }
      return <span class="text-xs text-muted-foreground">-</span>;
    }

    return (
      <div class="flex flex-wrap gap-1">
        <For each={list}>
          {(client) => (
            <Show
              when={isStockClient(client)}
              fallback={
                <span class="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {client}
                </span>
              }
            >
              <span class="inline-flex items-center rounded-md border border-status-selesai/30 bg-status-selesai/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-selesai">
                {t('purchaseOrders.stockBadge')}
              </span>
            </Show>
          )}
        </For>
      </div>
    );
  };

  const stats = () => data()?.stats;
  const items = () => data()?.items ?? [];
  const total = () => data()?.total ?? 0;

  return (
    <div class="flex flex-1 flex-col gap-6 min-w-0 pb-24 md:pb-0">
      {/* KPI Strip */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent class="p-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {t('purchaseOrders.totalItems')}
              </p>
              <Show when={!data.loading} fallback={<Skeleton class="h-7 w-16 mt-1" />}>
                <p class="text-2xl font-bold tracking-tight tabular-nums mt-1 text-foreground">
                  {stats()?.total ?? 0}
                </p>
              </Show>
            </div>
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconShoppingCart class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {t('purchaseOrders.clientRequests')}
              </p>
              <Show when={!data.loading} fallback={<Skeleton class="h-7 w-16 mt-1" />}>
                <p class="text-2xl font-bold tracking-tight tabular-nums mt-1 text-foreground">
                  {stats()?.client_items ?? 0}
                </p>
              </Show>
            </div>
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconUsers class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {t('purchaseOrders.pendingOrders')}
              </p>
              <Show when={!data.loading} fallback={<Skeleton class="h-7 w-16 mt-1" />}>
                <p class="text-2xl font-bold tracking-tight tabular-nums mt-1 text-foreground">
                  {stats()?.pending_items ?? 0}
                </p>
              </Show>
            </div>
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconClock class="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {t('purchaseOrders.finishedOrders')}
              </p>
              <Show when={!data.loading} fallback={<Skeleton class="h-7 w-16 mt-1" />}>
                <p class="text-2xl font-bold tracking-tight tabular-nums mt-1 text-foreground">
                  {stats()?.finished_items ?? 0}
                </p>
              </Show>
            </div>
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconCircleCheck class="size-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card class="hidden md:block">
        <CardContent class="p-4 md:p-6">
          <form class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-4" onSubmit={applyFilters}>
            <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[220px]">
              <TextField value={searchDraft()} onChange={handleSearchInput}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  {t('purchaseOrders.searchLabel')}
                </TextFieldLabel>
                <TextFieldInput
                  placeholder={t('purchaseOrders.searchPlaceholder')}
                  class="h-9 w-full"
                />
              </TextField>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[165px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">
                {t('purchaseOrders.typeLabel')}
              </label>
              <Select<SelectOption>
                options={typeOptions()}
                optionValue="value"
                optionTextValue="label"
                value={selectedTypeOption()}
                allowDuplicateSelectionEvents={false}
                onChange={(opt) => {
                  const next = opt?.value || 'all';
                  if (next !== filters.values.type()) {
                    filters.setters.type(next);
                  }
                }}
                itemComponent={(itemProps) => (
                  <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<SelectOption>>
                    {(state) => state.selectedOption()?.label ?? t('purchaseOrders.typeAll')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[180px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">
                {t('purchaseOrders.supplierLabel')}
              </label>
              <Select<SelectOption>
                options={supplierOptions()}
                optionValue="value"
                optionTextValue="label"
                value={selectedSupplierOption()}
                allowDuplicateSelectionEvents={false}
                onChange={(opt) => {
                  const next = opt?.value || '';
                  if (next !== filters.values.supplier()) {
                    filters.setters.supplier(next);
                  }
                }}
                itemComponent={(itemProps) => (
                  <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<SelectOption>>
                    {(state) => state.selectedOption()?.label ?? t('purchaseOrders.allSuppliers')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[180px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">
                {t('purchaseOrders.statusLabel')}
              </label>
              <Select<SelectOption>
                options={statusOptions()}
                optionValue="value"
                optionTextValue="label"
                value={selectedStatusOption()}
                allowDuplicateSelectionEvents={false}
                onChange={(opt) => {
                  const next = opt?.value || '';
                  if (next !== filters.values.status()) {
                    filters.setters.status(next);
                  }
                }}
                itemComponent={(itemProps) => (
                  <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<SelectOption>>
                    {(state) => state.selectedOption()?.label ?? t('purchaseOrders.allStatuses')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="col-span-1 sm:col-span-2 lg:col-auto flex items-center gap-2 w-full lg:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-9 flex-1 sm:flex-initial gap-1.5"
                onClick={handleReset}
              >
                <IconRotateClockwise class="size-3.5" />
                {t('common.reset')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-9 flex-1 sm:flex-initial gap-1.5"
                onClick={() => void refetch()}
                disabled={data.loading}
              >
                <IconRefresh class={`size-3.5 ${data.loading ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Main Ledger Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">{t('purchaseOrders.title')}</CardTitle>
            <CardDescription>{t('purchaseOrders.subtitle')}</CardDescription>
          </div>
        </CardHeader>

        <CardContent class="p-4 md:p-6 pt-0 space-y-4">
          <Show when={data.error}>
            <div class="rounded-md border border-status-batal/30 bg-status-batal/10 p-4 text-sm text-status-batal flex items-center justify-between gap-3 mb-4">
              <span>{t('purchaseOrders.loadError')}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          </Show>

          {/* Desktop DataTable */}
          <div class="hidden md:block">
            <DataTable>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="tanggal"
                    label={t('purchaseOrders.colDate')}
                    direction={getSortDirection('tanggal')}
                    onSort={handleSort}
                    class="w-[120px] whitespace-nowrap"
                  />
                  <SortableTableHead
                    field="pemasok"
                    label={t('purchaseOrders.colSupplier')}
                    direction={getSortDirection('pemasok')}
                    onSort={handleSort}
                    class="w-[180px]"
                  />
                  <SortableTableHead
                    field="nama_barang"
                    label={t('purchaseOrders.colItemName')}
                    direction={getSortDirection('nama_barang')}
                    onSort={handleSort}
                  />
                  <TableHead class="w-[110px] whitespace-nowrap">
                    {t('purchaseOrders.colQty')}
                  </TableHead>
                  <SortableTableHead
                    field="status_order"
                    label={t('purchaseOrders.colStatus')}
                    direction={getSortDirection('status_order')}
                    onSort={handleSort}
                    class="w-[150px]"
                  />
                  <TableHead class="w-[220px]">{t('purchaseOrders.colRequestedBy')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={<TableSkeleton columns={6} rows={5} />}
                >
                  <Show
                    when={items().length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={6} class="h-24 text-center text-muted-foreground">
                          <p class="text-sm font-medium text-foreground">
                            {t('purchaseOrders.emptyTitle')}
                          </p>
                          <p class="text-xs text-muted-foreground mt-1">
                            {t('purchaseOrders.emptyDescription')}
                          </p>
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={items()}>
                      {(item) => (
                        <TableRow>
                          <TableCell class="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                            {formatRowDate(item.tanggal)}
                          </TableCell>
                          <TableCell class="font-medium text-sm">
                            {item.pemasok || '-'}
                          </TableCell>
                          <TableCell class="min-w-[240px]">
                            <div class="font-semibold text-sm text-foreground">
                              {item.nama_barang}
                            </div>
                            <Show when={item.kode_barang || item.nie}>
                              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
                                <Show when={item.kode_barang}>
                                  <span>{item.kode_barang}</span>
                                </Show>
                                <Show when={item.nie}>
                                  <span>NIE: {item.nie}</span>
                                </Show>
                              </div>
                            </Show>
                            <Show when={item.catatan}>
                              <div class="text-xs text-status-pending flex items-start gap-1 mt-1">
                                <IconAlertTriangle class="size-3.5 shrink-0 mt-0.5" />
                                <span>{item.catatan}</span>
                              </div>
                            </Show>
                          </TableCell>
                          <TableCell class="font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                            {item.jumlah} {item.satuan}
                          </TableCell>
                          <TableCell>{renderStatusBadge(item.status_order)}</TableCell>
                          <TableCell>{renderClients(item)}</TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
              </TableBody>
            </DataTable>
          </div>

          {/* Mobile Card List */}
          <div class="block md:hidden space-y-3">
            <Show
              when={!data.loading}
              fallback={
                <For each={[1, 2, 3, 4]}>
                  {() => (
                    <div class="rounded-lg border bg-card p-3.5 space-y-2.5">
                      <div class="flex items-center justify-between gap-2">
                        <Skeleton class="h-4 w-24" />
                        <Skeleton class="h-5 w-20" />
                      </div>
                      <Skeleton class="h-5 w-3/4" />
                      <Skeleton class="h-4 w-1/2" />
                    </div>
                  )}
                </For>
              }
            >
              <Show
                when={items().length > 0}
                fallback={
                  <div class="rounded-lg border bg-card p-6 text-center">
                    <p class="text-sm font-medium text-foreground">
                      {t('purchaseOrders.emptyTitle')}
                    </p>
                    <p class="text-xs text-muted-foreground mt-1">
                      {t('purchaseOrders.emptyDescription')}
                    </p>
                  </div>
                }
              >
                <For each={items()}>
                  {(item) => (
                    <div class="rounded-lg border bg-card p-3.5 space-y-2.5 min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatRowDate(item.tanggal)}
                        </span>
                        <div class="shrink-0">{renderStatusBadge(item.status_order)}</div>
                      </div>

                      <div class="min-w-0">
                        <div class="font-semibold text-sm text-foreground break-words">
                          {item.nama_barang}
                        </div>
                        <Show when={item.kode_barang || item.nie}>
                          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground break-all">
                            <Show when={item.kode_barang}>
                              <span>{item.kode_barang}</span>
                            </Show>
                            <Show when={item.nie}>
                              <span>NIE: {item.nie}</span>
                            </Show>
                          </div>
                        </Show>
                        <Show when={item.catatan}>
                          <div class="text-xs text-status-pending flex items-start gap-1 mt-1">
                            <IconAlertTriangle class="size-3.5 shrink-0 mt-0.5" />
                            <span class="break-words">{item.catatan}</span>
                          </div>
                        </Show>
                      </div>

                      <div class="flex items-center justify-between gap-3 pt-2 border-t text-xs">
                        <div class="min-w-0 truncate text-muted-foreground">
                          <span class="font-medium text-foreground">{item.pemasok || '-'}</span>
                        </div>
                        <div class="font-mono font-semibold tabular-nums whitespace-nowrap shrink-0">
                          {item.jumlah} {item.satuan}
                        </div>
                      </div>

                      <div class="pt-1">{renderClients(item)}</div>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </div>

          <Show when={total() > 0}>
            <DataTablePagination
              total={total()}
              limit={filters.values.limit()}
              offset={filters.values.offset()}
              onPageChange={(newOffset) => filters.setters.offset(newOffset)}
              onLimitChange={handleLimitChange}
            />
          </Show>
        </CardContent>
      </Card>
      <Portal>
        <Show when={dockFilterOpen()}>
          <div
            class="df-dock-backdrop md:hidden no-print"
            onClick={() => setDockFilterOpen(false)}
          />
        </Show>
        <div
          class="fixed bottom-2 left-2 right-2 z-40 rounded-2xl border bg-card/98 p-2.5 shadow-2xl backdrop-blur-md md:hidden no-print"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && dockFilterOpen()) {
              e.stopPropagation();
              setDockFilterOpen(false);
            }
          }}
        >
          <Show when={dockFilterOpen()}>
            <div class="mb-2.5 p-3 rounded-xl border bg-background shadow-inner max-h-[65dvh] overflow-y-auto space-y-3 animate-[card-enter_200ms_ease-out_both] motion-reduce:animate-none">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <IconAdjustmentsHorizontal class="size-3.5 text-primary" />
                  <span>{t('deliveryFlow.filters')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDockFilterOpen(false)}
                  class="size-6 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                  aria-label={t('common.close')}
                >
                  <IconX class="size-3.5" />
                </button>
              </div>

              <TextField value={searchDraft()} onChange={handleSearchInput}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  {t('purchaseOrders.searchLabel')}
                </TextFieldLabel>
                <TextFieldInput
                  placeholder={t('purchaseOrders.searchPlaceholder')}
                  class="h-9 w-full"
                />
              </TextField>

              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold text-muted-foreground">
                  {t('purchaseOrders.typeLabel')}
                </label>
                <Select<SelectOption>
                  options={typeOptions()}
                  optionValue="value"
                  optionTextValue="label"
                  value={selectedTypeOption()}
                  allowDuplicateSelectionEvents={false}
                  onChange={(opt) => {
                    const next = opt?.value || 'all';
                    if (next !== filters.values.type()) {
                      filters.setters.type(next);
                    }
                  }}
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                  )}
                >
                  <SelectTrigger class="h-9 w-full">
                    <SelectValue<SelectOption>>
                      {(state) => state.selectedOption()?.label ?? t('purchaseOrders.typeAll')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold text-muted-foreground">
                  {t('purchaseOrders.supplierLabel')}
                </label>
                <Select<SelectOption>
                  options={supplierOptions()}
                  optionValue="value"
                  optionTextValue="label"
                  value={selectedSupplierOption()}
                  allowDuplicateSelectionEvents={false}
                  onChange={(opt) => {
                    const next = opt?.value || '';
                    if (next !== filters.values.supplier()) {
                      filters.setters.supplier(next);
                    }
                  }}
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                  )}
                >
                  <SelectTrigger class="h-9 w-full">
                    <SelectValue<SelectOption>>
                      {(state) => state.selectedOption()?.label ?? t('purchaseOrders.allSuppliers')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold text-muted-foreground">
                  {t('purchaseOrders.statusLabel')}
                </label>
                <Select<SelectOption>
                  options={statusOptions()}
                  optionValue="value"
                  optionTextValue="label"
                  value={selectedStatusOption()}
                  allowDuplicateSelectionEvents={false}
                  onChange={(opt) => {
                    const next = opt?.value || '';
                    if (next !== filters.values.status()) {
                      filters.setters.status(next);
                    }
                  }}
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
                  )}
                >
                  <SelectTrigger class="h-9 w-full">
                    <SelectValue<SelectOption>>
                      {(state) => state.selectedOption()?.label ?? t('purchaseOrders.allStatuses')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-9 flex-1 gap-1.5"
                  onClick={handleReset}
                >
                  <IconRotateClockwise class="size-3.5" />
                  {t('common.reset')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  class="h-9 flex-1"
                  onClick={() => setDockFilterOpen(false)}
                >
                  {t('deliveryFlow.done')}
                </Button>
              </div>
            </div>
          </Show>

          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant={dockFilterOpen() ? 'default' : 'outline'}
              class="flex-1 h-10 rounded-xl gap-1.5 text-xs font-medium"
              onClick={() => setDockFilterOpen((prev) => !prev)}
              aria-expanded={dockFilterOpen()}
            >
              <IconAdjustmentsHorizontal class="size-4" />
              <span>{t('deliveryFlow.filters')}</span>
              <Show when={activeFilterCount() > 0}>
                <span
                  class={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums ${
                    dockFilterOpen()
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/15 text-primary'
                  }`}
                >
                  {activeFilterCount()}
                </span>
              </Show>
              <IconChevronDown
                class={`size-3.5 ml-auto transition-transform duration-200 ${
                  dockFilterOpen() ? 'rotate-180' : ''
                }`}
              />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              class="size-10 rounded-xl shrink-0"
              onClick={() => void refetch()}
              disabled={data.loading}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <IconRefresh class={`size-4 ${data.loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Portal>
    </div>
  );
};
