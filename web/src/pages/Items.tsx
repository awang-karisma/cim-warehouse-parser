import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { useI18n } from '~/i18n';
import { A } from '@solidjs/router';
import { IconDownload } from '@tabler/icons-solidjs';
import { getItems } from '../api';
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
import { Badge } from '../components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { DataTablePagination } from '../components/data-table-pagination';
import { SortableTableHead } from '~/components/SortableTableHead';
import { createUrlFilter } from '../utils/tableFilters';
import { DeliveryDateBadges } from '~/components/DeliveryDateBadges';

const VALID_STATUS_ORDERS = ['BELUM SELESAI', 'SELESAI', 'PROSES', 'PENDING', 'BATAL'] as const;
const STATUS_BARANG_OPTIONS = ['All', 'PROSES ORDER', 'STOK GUDANG', 'STOK KOSONG', 'DELIVERY VENDOR', 'DONE', 'OTHER'] as const;
export const Items: Component = () => {
  const { t } = useI18n();
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
      parse: (v) => (v && VALID_STATUS_ORDERS.includes(v as (typeof VALID_STATUS_ORDERS)[number]) ? v : ''),
      serialize: (v) => v || null,
    },
    status_barang: {
      key: 'status_barang',
      defaultValue: '',
      parse: (v) => {
        if (!v) return '';
        const found = STATUS_BARANG_OPTIONS.find((opt) => opt.toLowerCase() === v.toLowerCase());
        return found && found !== 'All' ? found : '';
      },
      serialize: (v) => (v && v !== 'All' ? v : null),
    },
    tanggal: {
      key: 'tanggal',
      defaultValue: '',
      parse: (v) => v ?? '',
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

  const queryParams = createMemo(() => {
    const sb = filters.values.status_barang();
    return {
      limit: filters.values.limit(),
      offset: filters.values.offset(),
      customer: filters.debouncedValues.customer() || undefined,
      nama_barang: filters.debouncedValues.nama_barang() || undefined,
      status_order: filters.values.status_order() || undefined,
      status_barang: sb && sb !== 'All' ? sb : undefined,
      status_barang_other: sb === 'OTHER' ? true : undefined,
      tanggal: filters.values.tanggal() || undefined,
      sort: filters.values.sort(),
      order: filters.values.order(),
    };
  });

  const [data] = createResource(queryParams, (params) => getItems(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    filters.flush();
  };

  const handleLimitChange = (newLimit: number) => {
    filters.setters.limit(newLimit);
    filters.setters.offset(0);
  };

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

  const getExportUrl = () => {
    const p = new URLSearchParams();
    const customer = filters.values.customer();
    const namaBarang = filters.values.nama_barang();
    const statusOrder = filters.values.status_order();
    const statusBarang = filters.values.status_barang();
    const tanggal = filters.values.tanggal();
    const sort = filters.values.sort();
    const order = filters.values.order();
    if (customer) p.set('customer', customer);
    if (namaBarang) p.set('nama_barang', namaBarang);
    if (statusOrder) p.set('status_order', statusOrder);
    if (statusBarang && statusBarang !== 'All') {
      p.set('status_barang', statusBarang);
      if (statusBarang === 'OTHER') {
        p.set('status_barang_other', 'true');
      }
    }
    if (tanggal) p.set('tanggal', tanggal);
    if (sort && sort !== 'date') p.set('sort', sort);
    if (order && order !== 'desc') p.set('order', order);
    return `/api/v1/items/export?${p.toString()}`;
  };

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Filter Toolbar (Tasks Example Pattern) */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <form class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-4" onSubmit={applyFilters}>
            <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[180px]">
              <TextField value={filters.values.customer()} onChange={filters.setters.customer}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  {t('items.customerName')}
                </TextFieldLabel>
                <TextFieldInput placeholder={t('items.filterCustomerPlaceholder')} class="h-9 w-full" />
              </TextField>
            </div>

            <div class="w-full lg:w-auto lg:flex-1 lg:min-w-[180px]">
              <TextField value={filters.values.nama_barang()} onChange={filters.setters.nama_barang}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  {t('items.itemName')}
                </TextFieldLabel>
                <TextFieldInput placeholder={t('items.filterItemPlaceholder')} class="h-9 w-full" />
              </TextField>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[150px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">{t('items.statusOrder')}</label>
              <Select<string>
                options={[t('orders.allStatuses'), ...VALID_STATUS_ORDERS]}
                value={filters.values.status_order() || t('orders.allStatuses')}
                onChange={(val) => filters.setters.status_order(!val || val === t('orders.allStatuses') ? '' : val)}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<string>>{(state) => state.selectedOption() || t('orders.allStatuses')}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[150px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">{t('items.statusBarang')}</label>
              <Select<string>
                options={STATUS_BARANG_OPTIONS as unknown as string[]}
                value={filters.values.status_barang() || t('items.allStatusBarang')}
                onChange={(val) => filters.setters.status_barang(!val || val === 'All' || val === t('items.allStatusBarang') ? '' : val)}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="h-9 w-full">
                  <SelectValue<string>>{(state) => state.selectedOption() || t('items.allStatusBarang')}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="w-full lg:w-auto lg:min-w-[140px]">
              <TextField value={filters.values.tanggal()} onChange={filters.setters.tanggal}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">{t('items.date')}</TextFieldLabel>
                <TextFieldInput type="date" class="h-9 w-full" />
              </TextField>
            </div>

            <div class="col-span-1 sm:col-span-2 lg:col-auto flex items-center gap-2 w-full lg:w-auto">
              <Button type="submit" size="sm" class="h-9 flex-1 sm:flex-initial">
                {t('common.apply')}
              </Button>
              <Button type="button" variant="outline" size="sm" class="h-9 flex-1 sm:flex-initial" onClick={filters.reset}>
                {t('common.reset')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Items Table Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">{t('items.title')}</CardTitle>
            <CardDescription>
              {data()?.total !== undefined ? t('items.totalItems', { count: data()!.total.toLocaleString() }) : t('items.title')}
            </CardDescription>
          </div>
          <Button
            as="a"
            href={getExportUrl()}
            download="items.csv"
            variant="outline"
            size="sm"
            class="gap-1.5 self-start sm:self-auto"
          >
            <IconDownload class="size-4" />
            <span>{t('items.exportCsv')}</span>
          </Button>
        </CardHeader>
        <CardContent class="p-4 md:p-6 pt-0 space-y-4">
          <DataTable>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="row_index"
                    label={t('items.row')}
                    class="w-12"
                    direction={filters.values.sort() === 'row_index' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="order_number"
                    label={t('items.orderNo')}
                    direction={filters.values.sort() === 'order_number' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="customer"
                    label={t('items.customer')}
                    direction={filters.values.sort() === 'customer' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="area"
                    label={t('items.area')}
                    direction={filters.values.sort() === 'area' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="date"
                    label={t('items.date')}
                    direction={filters.values.sort() === 'date' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="nama_barang"
                    label={t('items.itemName')}
                    direction={filters.values.sort() === 'nama_barang' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="jumlah"
                    label={t('items.qty')}
                    class="text-right"
                    direction={filters.values.sort() === 'jumlah' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="status_order"
                    label={t('items.statusOrder')}
                    direction={filters.values.sort() === 'status_order' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="status_barang"
                    label={t('items.statusBarang')}
                    direction={filters.values.sort() === 'status_barang' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="tanggal_pengiriman"
                    label={t('items.deliveryDate')}
                    direction={filters.values.sort() === 'tanggal_pengiriman' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    field="catatan"
                    label={t('items.notes')}
                    direction={filters.values.sort() === 'catatan' ? filters.values.order() : undefined}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!data.loading}
                  fallback={
                    <TableSkeleton columns={11} rows={5} />
                  }
                >
                  <Show
                    when={data()?.items && data()!.items.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={11} class="h-24 text-center text-muted-foreground">
                          {t('items.noItemsMatch')}
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
                            <Badge status={item.status_order} kind="order" />
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_barang} kind="item" />
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            <DeliveryDateBadges date={item.tanggal_pengiriman} />
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
