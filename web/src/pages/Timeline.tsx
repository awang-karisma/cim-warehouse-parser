import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
  IconTruckDelivery,
  IconCircleCheck,
  IconClockHour4,
  IconTimeline,
} from '@tabler/icons-solidjs';
import { getDeliveries, getDeliveryStats } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '~/components/ui/select';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { TableSkeleton } from '~/components/TableSkeleton';
import { Badge } from '../components/Badge';
import { Badge as UiBadge } from '~/components/ui/badge';
import { SortableTableHead } from '~/components/SortableTableHead';
import { DataTablePagination } from '../components/data-table-pagination';
import { createUrlFilter } from '../utils/tableFilters';
import { normalizeDeliveryDate } from '~/components/DeliveryDateBadges';
import { ItemProgress } from '~/components/ItemProgress';

const formatShippedQuantity = (qty?: string, unit?: string): string => {
  if (!qty || qty.trim() === '' || qty.trim() === '-') return '-';
  const trimmedQty = qty.trim();
  if (!unit || unit.trim() === '' || trimmedQty.toLowerCase().endsWith(unit.trim().toLowerCase())) {
    return trimmedQty;
  }
  return `${trimmedQty} ${unit.trim()}`;
};

const VALID_STATUSES = ['SELESAI', 'PROSES', 'PENDING', 'BATAL'] as const;

export const Timeline: Component = () => {
  const navigate = useNavigate();
  const filters = createUrlFilter({
    status: {
      key: 'status',
      defaultValue: '',
      parse: (v) => (v && VALID_STATUSES.includes(v as (typeof VALID_STATUSES)[number]) ? v : ''),
      serialize: (v) => v || null,
    },
    date: {
      key: 'date',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
    sort: {
      key: 'sort',
      defaultValue: 'date',
      parse: (v) => v ?? 'date',
      serialize: (v) => (v === 'date' ? null : v),
    },
    order: {
      key: 'order',
      defaultValue: 'desc' as 'asc' | 'desc',
      parse: (v) => (v === 'asc' ? 'asc' : 'desc'),
      serialize: (v) => (v === 'desc' ? null : v),
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

  const [statsData] = createResource(getDeliveryStats);

  const queryParams = createMemo(() => ({
    limit: filters.values.limit(),
    offset: filters.values.offset(),
    status_order: filters.values.status() || undefined,
    date: filters.debouncedValues.date() || undefined,
    sort: filters.values.sort(),
    order: filters.values.order(),
  }));

  const [deliveriesData] = createResource(queryParams, getDeliveries);
  const deliveriesList = createMemo(() => deliveriesData()?.deliveries || []);

  const handleSort = (field: string) => {
    const currentSort = filters.values.sort();
    const currentOrder = filters.values.order();
    filters.setters.offset(0);
    if (currentSort === field) {
      filters.setters.order(currentOrder === 'asc' ? 'desc' : 'asc');
    } else {
      filters.setters.sort(field);
      filters.setters.order(field === 'date' ? 'desc' : 'asc');
    }
  };

  const handleLimitChange = (newLimit: number) => {
    filters.setters.limit(newLimit);
    filters.setters.offset(0);
  };
  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* KPI Summary Cards */}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Deliveries Scheduled
            </CardTitle>
            <IconTruckDelivery class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Show when={!statsData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold">{statsData()?.total_scheduled ?? 0}</div>
              <p class="text-xs text-muted-foreground mt-1">Logged delivery dispatches</p>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Deliveries
            </CardTitle>
            <IconCircleCheck class="size-4 text-status-selesai" />
          </CardHeader>
          <CardContent>
            <Show when={!statsData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold text-status-selesai">{statsData()?.completed ?? 0}</div>
              <p class="text-xs text-muted-foreground mt-1">100% fulfilled shipments</p>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In-Transit / Pending
            </CardTitle>
            <IconClockHour4 class="size-4 text-status-proses" />
          </CardHeader>
          <CardContent>
            <Show when={!statsData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold text-status-proses">{statsData()?.pending ?? 0}</div>
              <p class="text-xs text-muted-foreground mt-1">Partial or pending orders</p>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Avg Lead Time
            </CardTitle>
            <IconTimeline class="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <Show when={!statsData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold">{(statsData()?.avg_lead_time ?? 0).toFixed(1)} Days</div>
              <p class="text-xs text-muted-foreground mt-1">Order to dispatch duration</p>
            </Show>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar Card */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-4">
            <div class="w-full lg:w-auto lg:min-w-[160px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Delivery Status</label>
              <Select<string>
                options={['All Statuses', 'SELESAI', 'PROSES', 'PENDING', 'BATAL']}
                value={filters.values.status() || 'All Statuses'}
                onChange={(val) => {
                  filters.setters.status(!val || val === 'All Statuses' ? '' : val);
                  filters.setters.offset(0);
                }}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<string>>{(state) => state.selectedOption() || 'All Statuses'}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[160px]">
              <TextField
                value={filters.values.date()}
                onChange={(val) => {
                  filters.setters.date(val);
                  filters.setters.offset(0);
                }}
              >
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Delivery Date
                </TextFieldLabel>
                <TextFieldInput type="date" class="h-9 w-full" />
              </TextField>
            </div>

            <div class="col-span-1 sm:col-span-2 lg:col-auto flex items-center gap-2 w-full lg:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-9 w-full sm:w-auto"
                onClick={filters.reset}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deliveries Schedule Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">Delivery Shipments & Schedule</CardTitle>
            <CardDescription>
              {deliveriesData()?.total ?? 0} tracked shipments across logistics operations
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="p-4 md:p-6 space-y-4">
          <DataTable>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="date"
                    label="Delivery Date"
                    direction={filters.values.sort() === 'date' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="customer"
                    label="Customer"
                    direction={filters.values.sort() === 'customer' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <TableHead>Area</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Delivered Qty</TableHead>
                  <TableHead class="min-w-[120px]">Delivery Progress</TableHead>
                  <TableHead>Remaining</TableHead>
                  <SortableTableHead
                    field="status"
                    label="Status"
                    direction={filters.values.sort() === 'status' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!deliveriesData.loading}
                  fallback={
                    <TableSkeleton columns={9} rows={5} />
                  }
                >
                  <Show
                    when={deliveriesList().length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={9} class="h-24 text-center text-muted-foreground">
                          No shipments with delivery dates recorded
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={deliveriesList()}>
                      {(del) => (
                        <TableRow
                          class={del.item.order_id ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}
                          onClick={() => {
                            const selection = window.getSelection();
                            if (selection && selection.toString().length > 0) return;
                            if (del.item.order_id) {
                              navigate(`/orders/${del.item.order_id}`);
                            }
                          }}
                        >
                          <TableCell class="text-xs text-muted-foreground">
                            {normalizeDeliveryDate(del.delivery_date)}
                          </TableCell>
                          <TableCell class="font-medium text-xs">{del.item.customer}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">{del.item.area}</TableCell>
                          <TableCell class="text-xs font-medium">
                            <Show when={del.item.order_id} fallback={del.item.nama_barang}>
                              <A
                                href={`/orders/${del.item.order_id}`}
                                class="text-primary hover:underline hover:text-primary/80 transition-colors font-medium inline-block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {del.item.nama_barang}
                              </A>
                              <span class="block text-[10px] font-mono text-muted-foreground mt-0.5">
                                {del.item.order_id}
                                {del.item.order_number && del.item.order_number !== del.item.order_id
                                  ? ` • ${del.item.order_number}`
                                  : ''}
                              </span>
                            </Show>
                          </TableCell>
                          <TableCell>
                            <Show when={del.item.lead_time_pengiriman} fallback={<span class="text-muted-foreground">-</span>}>
                              <UiBadge variant="secondary" class="font-mono text-xs">
                                {del.item.lead_time_pengiriman} Days
                              </UiBadge>
                            </Show>
                          </TableCell>
                          <TableCell class="text-xs font-medium">
                            {formatShippedQuantity(del.shipped_quantity, del.item.satuan)}
                          </TableCell>
                          <TableCell class="min-w-[120px]">
                            <div class="flex flex-col gap-1 min-w-[120px] max-w-[180px]">
                              <ItemProgress
                                terkirim={del.item.jumlah_terkirim}
                                total={del.item.jumlah}
                              />
                              <span class="text-[11px] font-mono text-muted-foreground">
                                {del.item.jumlah_terkirim || '0'} / {del.item.jumlah || '0'}{del.item.satuan ? ` ${del.item.satuan}` : ''}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell class="text-xs">
                            <Show
                              when={del.shipment_index === 0}
                              fallback={<span class="text-muted-foreground">-</span>}
                            >
                              <Show
                                when={parseFloat(del.item.belum_terkirim) > 0}
                                fallback={<span class="text-status-selesai font-medium">Completed</span>}
                              >
                                <span class="text-status-pending font-semibold">
                                  {del.item.belum_terkirim} {del.item.satuan}
                                </span>
                              </Show>
                            </Show>
                          </TableCell>
                          <TableCell>
                            <Badge status={del.item.status_order} kind="order" />
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
              </TableBody>
          </DataTable>

          <Show when={deliveriesData() && deliveriesData()!.total > 0}>
            <DataTablePagination
              total={deliveriesData()!.total}
              limit={filters.values.limit()}
              offset={filters.values.offset()}
              onPageChange={filters.setters.offset}
              onLimitChange={handleLimitChange}
            />
          </Show>
        </CardContent>
      </Card>
    </div>
  );
};
