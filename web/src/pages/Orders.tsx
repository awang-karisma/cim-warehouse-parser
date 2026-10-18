import { type Component, createSignal, createResource, Show, For, createMemo, createEffect, on } from 'solid-js';
import { A } from '@solidjs/router';
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
import { DataTablePagination } from '../components/data-table-pagination';
import { createDebouncedSignal } from '../utils/debounce';

export const Orders: Component = () => {
  const [customer, debouncedCustomer, setCustomer, flushCustomer] = createDebouncedSignal('', 300);
  const [area, setArea] = createSignal('');
  const [tanggal, setTanggal] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [offset, setOffset] = createSignal(0);
  const [limit, setLimit] = createSignal(10);

  const [areasData] = createResource(getAreas);

  // When any filter changes, reset pagination offset to 0
  createEffect(
    on(
      [debouncedCustomer, area, tanggal, status],
      () => {
        setOffset(0);
      },
      { defer: true }
    )
  );

  // Active query state for triggering fetch
  const queryParams = createMemo(() => ({
    limit: limit(),
    offset: offset(),
    customer: debouncedCustomer() || undefined,
    area: area() || undefined,
    tanggal: tanggal() || undefined,
    status: status() || undefined,
  }));

  const [data] = createResource(queryParams, (params) => getOrders(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    flushCustomer();
  };

  const resetFilters = () => {
    setCustomer('');
    setArea('');
    setTanggal('');
    setStatus('');
    setOffset(0);
  };
  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setOffset(0);
  };

  const areaOptions = createMemo(() => [
    'All Areas',
    ...(areasData()?.areas.map((a) => a.name) || []),
  ]);

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Filter Toolbar (Tasks Example Pattern) */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <form class="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
            <div class="flex-1 min-w-[200px]">
              <TextField value={customer()} onChange={setCustomer}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Customer Name
                </TextFieldLabel>
                <TextFieldInput
                  placeholder="Filter by customer (e.g. RSUD)..."
                  class="h-9"
                />
              </TextField>
            </div>

            <div class="min-w-[180px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Area / Region</label>
              <Select<string>
                options={areaOptions()}
                value={area() || 'All Areas'}
                onChange={(val) => setArea(!val || val === 'All Areas' ? '' : val)}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9">
                  <SelectValue<string>>{(state) => state.selectedOption() || 'All Areas'}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="min-w-[150px]">
              <TextField value={tanggal()} onChange={setTanggal}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Order Date
                </TextFieldLabel>
                <TextFieldInput type="date" class="h-9" />
              </TextField>
            </div>

            <div class="min-w-[150px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Status</label>
              <Select<string>
                options={['All Statuses', 'SELESAI', 'PROSES', 'PENDING', 'BATAL']}
                value={status() || 'All Statuses'}
                onChange={(val) => setStatus(!val || val === 'All Statuses' ? '' : val)}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9">
                  <SelectValue<string>>{(state) => state.selectedOption() || 'All Statuses'}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="flex items-center gap-2">
              <Button type="submit" size="sm" class="h-9">
                Apply
              </Button>
              <Button type="button" variant="outline" size="sm" class="h-9" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Orders Table & Pagination Card */}
      <Card>
        <CardContent class="p-4 md:p-6 space-y-4">
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Order / E-Katalog No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead class="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead class="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <TableRow>
                      <TableCell colspan={8} class="h-32 text-center text-muted-foreground">
                        <Skeleton class="h-8 w-1/2 mx-auto" />
                      </TableCell>
                    </TableRow>
                  }
                >
                  <Show
                    when={data()?.orders && data()!.orders.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={8} class="h-24 text-center text-muted-foreground">
                          No orders matching current filters
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={data()?.orders}>
                      {(order) => {
                        const firstStatus = order.items?.[0]?.status_order || 'PENDING';
                        return (
                          <TableRow>
                            <TableCell>
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
                              <Badge status={firstStatus} />
                            </TableCell>
                            <TableCell class="text-right">
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
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </TableBody>
            </Table>
          </div>

          <Show when={data() && data()!.total > 0}>
            <DataTablePagination
              total={data()!.total}
              limit={limit()}
              offset={offset()}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          </Show>
        </CardContent>
      </Card>
    </div>
  );
};
