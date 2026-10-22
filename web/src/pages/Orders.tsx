import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconChevronRight,
  IconChevronDown,
  IconLoader2,
} from '@tabler/icons-solidjs';
import { getOrders, getAreas } from '../api';
import { Card, CardContent } from '~/components/ui/card';
import {
  Table,
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
import { Badge } from '../components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { DataTablePagination } from '../components/data-table-pagination';
import { SortableTableHead } from '~/components/SortableTableHead';
import { createUrlFilter } from '../utils/tableFilters';

const VALID_STATUSES = ['BELUM SELESAI', 'SELESAI', 'PROSES', 'PENDING', 'BATAL'] as const;

export function getDominantOrderStatus(items?: { status_order?: string }[]): string {
  if (!items || items.length === 0) return 'PENDING';
  const upperList = items.map((it) => {
    const s = it.status_order?.trim().toUpperCase() || '';
    return s === '-' || s === '' ? 'BELUM SELESAI' : s;
  });
  if (upperList.includes('BELUM SELESAI')) return 'BELUM SELESAI';
  if (upperList.includes('PROSES')) return 'PROSES';
  if (upperList.includes('PENDING')) return 'PENDING';
  const nonBlank = upperList.find((s) => s !== '');
  return nonBlank || items[0].status_order || 'PENDING';
}
 export const Orders: Component = () => {
  const [expandedOrders, setExpandedOrders] = createSignal<Record<string, boolean>>({});

  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const filters = createUrlFilter({
    customer: {
      key: 'customer',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
    area: {
      key: 'area',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
    },
    tanggal: {
      key: 'tanggal',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
    },
    status: {
      key: 'status',
      defaultValue: '',
      parse: (v) => (v && VALID_STATUSES.includes(v as (typeof VALID_STATUSES)[number]) ? v : ''),
      serialize: (v) => v || null,
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

  const [areasData] = createResource(getAreas);

  const queryParams = createMemo(() => ({
    limit: filters.values.limit(),
    offset: filters.values.offset(),
    customer: filters.debouncedValues.customer() || undefined,
    area: filters.values.area() || undefined,
    tanggal: filters.values.tanggal() || undefined,
    status: filters.values.status() || undefined,
    sort: filters.values.sort(),
    order: filters.values.order(),
  }));

  const handleSort = (field: string) => {
    const currentSort = filters.values.sort();
    const currentOrder = filters.values.order();
    if (currentSort === field) {
      filters.setters.order(currentOrder === 'asc' ? 'desc' : 'asc');
    } else {
      filters.setters.sort(field);
      filters.setters.order('asc');
    }
  };

  const [data] = createResource(queryParams, (params) => getOrders(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    filters.flush();
  };

  const handleLimitChange = (newLimit: number) => {
    filters.setters.limit(newLimit);
    filters.setters.offset(0);
  };
  const areaOptions = createMemo(() => {
    const names = areasData()?.areas.map((a) => a.name) || [];
    const current = filters.values.area();
    if (current && !names.includes(current)) {
      return ['All Areas', current, ...names];
    }
    return ['All Areas', ...names];
  });

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Filter Toolbar (Tasks Example Pattern) */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <form class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-4" onSubmit={applyFilters}>
            <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[200px]">
              <TextField value={filters.values.customer()} onChange={filters.setters.customer}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Customer Name
                </TextFieldLabel>
                <TextFieldInput
                  placeholder="Filter by customer (e.g. RSUD)..."
                  class="h-9 w-full"
                />
              </TextField>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[180px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Area / Region</label>
              <Select<string>
                options={areaOptions()}
                value={filters.values.area() || 'All Areas'}
                onChange={(val) => filters.setters.area(!val || val === 'All Areas' ? '' : val)}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<string>>{(state) => state.selectedOption() || 'All Areas'}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[150px]">
              <TextField value={filters.values.tanggal()} onChange={filters.setters.tanggal}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Order Date
                </TextFieldLabel>
                <TextFieldInput type="date" class="h-9 w-full" />
              </TextField>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[150px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Status</label>
              <Select<string>
                options={['All Statuses', 'BELUM SELESAI', 'SELESAI', 'PROSES', 'PENDING', 'BATAL']}
                value={filters.values.status() || 'All Statuses'}
                onChange={(val) => filters.setters.status(!val || val === 'All Statuses' ? '' : val)}
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

            <div class="col-span-1 sm:col-span-2 lg:col-auto flex items-center gap-2 w-full lg:w-auto">
              <Button type="submit" size="sm" class="h-9 flex-1 sm:flex-initial">
                Apply
              </Button>
              <Button type="button" variant="outline" size="sm" class="h-9 flex-1 sm:flex-initial" onClick={filters.reset}>
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Orders Table & Pagination Card */}
      <Card>
        <CardContent class="p-4 md:p-6 space-y-4">
          <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-10 px-2 text-center">
                    <span class="sr-only">Expand</span>
                  </TableHead>
                  <SortableTableHead
                    field="id"
                    label="Order ID"
                    direction={filters.values.sort() === 'id' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="order_number"
                    label="Order / E-Katalog No."
                    direction={filters.values.sort() === 'order_number' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="date"
                    label="Date"
                    direction={filters.values.sort() === 'date' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="customer"
                    label="Customer"
                    direction={filters.values.sort() === 'customer' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="area"
                    label="Area"
                    direction={filters.values.sort() === 'area' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="items"
                    label="Items"
                    class="text-right"
                    direction={filters.values.sort() === 'items' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="status"
                    label="Status"
                    direction={filters.values.sort() === 'status' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <TableHead class="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <>
                      <TableRow>
                        <TableCell colspan={9} class="py-6 text-center">
                          <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <IconLoader2 class="size-4 animate-spin text-primary" />
                            <span>Loading orders and line items...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableSkeleton columns={9} rows={5} />
                    </>
                  }
                >
                  <Show
                    when={data()?.orders && data()!.orders.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={9} class="h-24 text-center text-muted-foreground">
                          No orders matching current filters
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={data()?.orders}>
                      {(order) => {
                        const isExpanded = () => !!expandedOrders()[order.id];
                        const firstStatus = getDominantOrderStatus(order.items);
                        return (
                          <>
                            <TableRow
                              class={`cursor-pointer transition-colors ${
                                isExpanded() ? 'bg-muted/30 border-b-0' : 'hover:bg-muted/50'
                              }`}
                              onClick={() => toggleExpand(order.id)}
                            >
                              <TableCell class="w-10 px-2 text-center">
                                <button
                                  type="button"
                                  class="p-1 rounded hover:bg-muted text-muted-foreground transition-colors inline-flex items-center justify-center cursor-pointer"
                                  aria-label={isExpanded() ? `Collapse order ${order.id}` : `Expand order ${order.id}`}
                                  aria-expanded={isExpanded()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(order.id);
                                  }}
                                >
                                  <Show when={isExpanded()} fallback={<IconChevronRight class="size-4" />}>
                                    <IconChevronDown class="size-4 text-primary" />
                                  </Show>
                                </button>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <A
                                  href={`/orders/${order.id}`}
                                  class="font-medium text-primary hover:underline"
                                >
                                  {order.id}
                                </A>
                              </TableCell>
                              <TableCell class="font-mono text-xs text-muted-foreground">
                                {order.order_number || order.ecatalog_number || '-'}
                              </TableCell>
                              <TableCell class="text-xs text-muted-foreground">{order.tanggal}</TableCell>
                              <TableCell class="font-medium">{order.customer}</TableCell>
                              <TableCell class="text-xs text-muted-foreground">{order.area}</TableCell>
                              <TableCell class="text-right font-medium">
                                {order.total_items || order.items?.length || 0}
                              </TableCell>
                              <TableCell>
                                <Badge status={firstStatus} kind="order" />
                              </TableCell>
                              <TableCell class="text-right" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  as={A}
                                  href={`/orders/${order.id}`}
                                  variant="ghost"
                                  size="sm"
                                  class="text-xs"
                                >
                                  View Detail
                                </Button>
                              </TableCell>
                            </TableRow>

                            {/* Detail Tray for Line Items */}
                            <Show when={isExpanded()}>
                              <TableRow class="bg-muted/15 border-b border-border/80">
                                <TableCell colspan={9} class="p-4">
                                  <div class="rounded-lg border border-border bg-background overflow-hidden shadow-xs">
                                    <div class="overflow-x-auto">
                                      <Table class="text-xs">
                                        <TableHeader class="bg-muted/20">
                                          <TableRow>
                                            <TableHead class="w-12 h-9 px-3 text-muted-foreground font-semibold">#</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Item Name</TableHead>
                                            <TableHead class="h-9 px-3 text-right text-muted-foreground font-semibold">Quantity</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Delivery Date</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Lead Time</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Status Order</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Status Barang</TableHead>
                                            <TableHead class="h-9 px-3 text-muted-foreground font-semibold">Notes</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          <Show
                                            when={order.items && order.items.length > 0}
                                            fallback={
                                              <TableRow>
                                                <TableCell colspan={8} class="h-16 text-center text-xs text-muted-foreground">
                                                  No line items found.
                                                </TableCell>
                                              </TableRow>
                                            }
                                          >
                                            <For each={order.items}>
                                              {(item, idx) => (
                                                <TableRow class="hover:bg-muted/30">
                                                  <TableCell class="py-2.5 px-3 font-mono text-muted-foreground">
                                                    {item.row_index || idx() + 1}
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3 font-medium text-foreground">
                                                    {item.nama_barang}
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3 text-right font-medium text-foreground">
                                                    {item.jumlah}{item.satuan ? ` ${item.satuan}` : ''}
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3 text-muted-foreground">
                                                    {item.tanggal_pengiriman || '-'}
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3 text-muted-foreground">
                                                    {item.lead_time_pengiriman ? `${item.lead_time_pengiriman}d` : '-'}
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3">
                                                    <Badge status={item.status_order} kind="order" />
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3">
                                                    <Badge status={item.status_barang} kind="item" />
                                                  </TableCell>
                                                  <TableCell class="py-2.5 px-3 text-muted-foreground max-w-[200px] truncate" title={item.keterangan || item.catatan || ''}>
                                                    {item.keterangan || item.catatan || '-'}
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                            </For>
                                          </Show>
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </Show>
                          </>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </TableBody>
          </DataTable>

          <Show when={data() && data()!.total > 0}>
            <DataTablePagination
              total={data()!.total}
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
