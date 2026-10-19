import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { IconDownload } from '@tabler/icons-solidjs';
import { getItems } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
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
import { createUrlFilter } from '../utils/tableFilters';

const VALID_STATUSES = ['SELESAI', 'PROSES', 'PENDING', 'BATAL'] as const;

export const Items: Component = () => {
  const filters = createUrlFilter({
    customer: {
      key: 'customer',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
    nama_barang: {
      key: 'nama_barang',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
    status_order: {
      key: 'status_order',
      defaultValue: '',
      parse: (v) => (v && VALID_STATUSES.includes(v as (typeof VALID_STATUSES)[number]) ? v : ''),
      serialize: (v) => v || null,
    },
    tanggal: {
      key: 'tanggal',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
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

  const queryParams = createMemo(() => ({
    limit: filters.values.limit(),
    offset: filters.values.offset(),
    customer: filters.debouncedValues.customer() || undefined,
    nama_barang: filters.debouncedValues.nama_barang() || undefined,
    status_order: filters.values.status_order() || undefined,
    tanggal: filters.values.tanggal() || undefined,
  }));

  const [data] = createResource(queryParams, (params) => getItems(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    filters.flush();
  };

  const handleLimitChange = (newLimit: number) => {
    filters.setters.limit(newLimit);
    filters.setters.offset(0);
  };

  const getExportUrl = () => {
    const p = new URLSearchParams();
    const customer = filters.values.customer();
    const namaBarang = filters.values.nama_barang();
    const statusOrder = filters.values.status_order();
    const tanggal = filters.values.tanggal();
    if (customer) p.set('customer', customer);
    if (namaBarang) p.set('nama_barang', namaBarang);
    if (statusOrder) p.set('status_order', statusOrder);
    if (tanggal) p.set('tanggal', tanggal);
    return `/api/v1/items/export?${p.toString()}`;
  };

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Filter Toolbar (Tasks Example Pattern) */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <form class="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
            <div class="flex-1 min-w-[180px]">
              <TextField value={filters.values.customer()} onChange={filters.setters.customer}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Customer Name
                </TextFieldLabel>
                <TextFieldInput placeholder="Filter by customer (e.g. RSUD)..." class="h-9" />
              </TextField>
            </div>

            <div class="flex-1 min-w-[180px]">
              <TextField value={filters.values.nama_barang()} onChange={filters.setters.nama_barang}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Item Name (Nama Barang)
                </TextFieldLabel>
                <TextFieldInput placeholder="e.g. Needle, Spuit..." class="h-9" />
              </TextField>
            </div>

            <div class="min-w-[150px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Status Order</label>
              <Select<string>
                options={['All Statuses', 'SELESAI', 'PROSES', 'PENDING', 'BATAL']}
                value={filters.values.status_order() || 'All Statuses'}
                onChange={(val) => filters.setters.status_order(!val || val === 'All Statuses' ? '' : val)}
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

            <div class="min-w-[140px]">
              <TextField value={filters.values.tanggal()} onChange={filters.setters.tanggal}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">Date</TextFieldLabel>
                <TextFieldInput type="date" class="h-9" />
              </TextField>
            </div>

            <div class="flex items-center gap-2">
              <Button type="submit" size="sm" class="h-9">
                Apply
              </Button>
              <Button type="button" variant="outline" size="sm" class="h-9" onClick={filters.reset}>
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Items Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">Warehouse Line Items</CardTitle>
            <CardDescription>
              {data()?.total !== undefined ? `${data()!.total.toLocaleString()} total items recorded` : 'Catalog lines'}
            </CardDescription>
          </div>
          <Button
            as="a"
            href={getExportUrl()}
            download="items.csv"
            variant="outline"
            size="sm"
            class="gap-1.5"
          >
            <IconDownload class="size-4" />
            <span>Export CSV</span>
          </Button>
        </CardHeader>
        <CardContent class="p-4 md:p-6 pt-0 space-y-4">
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-12">Row</TableHead>
                  <TableHead>Order No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead class="text-right">Qty</TableHead>
                  <TableHead>Status Order</TableHead>
                  <TableHead>Status Barang</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <TableRow>
                      <TableCell colspan={11} class="h-32 text-center text-muted-foreground">
                        <Skeleton class="h-8 w-1/2 mx-auto" />
                      </TableCell>
                    </TableRow>
                  }
                >
                  <Show
                    when={data()?.items && data()!.items.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={11} class="h-24 text-center text-muted-foreground">
                          No items match the current filters
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={data()?.items}>
                      {(item) => (
                        <TableRow>
                          <TableCell class="font-mono text-xs text-muted-foreground">
                            {item.row_index}
                          </TableCell>
                          <TableCell>
                            <Show
                              when={item.order_id}
                              fallback={
                                <span class="font-mono text-xs text-muted-foreground">
                                  {item.order_number || item.ecatalog_number || '-'}
                                </span>
                              }
                            >
                              <A
                                href={`/orders/${item.order_id}`}
                                class="font-medium text-primary hover:underline font-mono text-xs"
                              >
                                {item.order_number || item.order_id}
                              </A>
                            </Show>
                          </TableCell>
                          <TableCell class="font-medium">{item.customer}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">{item.area}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">{item.tanggal}</TableCell>
                          <TableCell class="font-medium">{item.nama_barang}</TableCell>
                          <TableCell class="text-right font-medium">
                            {item.jumlah} {item.satuan}
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_order} />
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_barang} />
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            {item.tanggal_pengiriman || '-'}
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground max-w-[200px] truncate">
                            {item.keterangan || item.catatan || '-'}
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
              </TableBody>
            </Table>
          </div>

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
