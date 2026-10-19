import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import {
  IconTruckDelivery,
  IconCircleCheck,
  IconClockHour4,
  IconTimeline,
} from '@tabler/icons-solidjs';
import { getDeliveries } from '../api';
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
import { Badge as UiBadge } from '~/components/ui/badge';
import { createUrlFilter } from '../utils/tableFilters';

const DeliveryProgress: Component<{ terkirim: string | number; total: string | number }> = (props) => {
  const percent = createMemo(() => {
    const t = parseFloat(String(props.total)) || 0;
    const sent = parseFloat(String(props.terkirim)) || 0;
    if (t <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((sent / t) * 100)));
  });

  const barColor = createMemo(() => {
    const p = percent();
    if (p >= 100) return 'bg-status-selesai';
    if (p > 0) return 'bg-status-proses';
    return 'bg-status-pending';
  });

  return (
    <div class="flex items-center gap-2">
      <div class="flex-1 h-2 bg-secondary rounded-full overflow-hidden min-w-[60px]">
        <div
          class={`h-full rounded-full transition-all duration-300 ${barColor()}`}
          style={{ width: `${percent()}%` }}
        />
      </div>
      <span class="text-xs font-semibold w-8 text-right text-muted-foreground">{percent()}%</span>
    </div>
  );
};

const formatDeliveryDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const trimmed = dateStr.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  return trimmed;
};

const VALID_STATUSES = ['SELESAI', 'PROSES', 'PENDING', 'BATAL'] as const;

export const Timeline: Component = () => {
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
  });

  // Fetch individual deliveries with limit 100 for timeline analysis
  const [deliveriesData] = createResource(
    () => ({ status_order: filters.values.status(), date: filters.debouncedValues.date() }),
    (params) => getDeliveries({ limit: 100, ...params })
  );
  const deliveriesList = createMemo(() => deliveriesData()?.deliveries || []);

  const summary = createMemo(() => {
    const list = deliveriesList();
    let completed = 0;
    let pending = 0;
    let totalLead = 0;
    let leadCount = 0;

    for (const del of list) {
      const belum = parseFloat(del.item.belum_terkirim) || 0;
      if (belum === 0 && del.item.status_order?.toUpperCase() === 'SELESAI') {
        completed++;
      } else {
        pending++;
      }

      const lt = parseFloat(del.item.lead_time_pengiriman);
      if (!isNaN(lt) && lt >= 0) {
        totalLead += lt;
        leadCount++;
      }
    }

    const avgLead = leadCount > 0 ? (totalLead / leadCount).toFixed(1) : '0';
    return {
      total: list.length,
      completed,
      pending,
      avgLead,
    };
  });

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
            <Show when={!deliveriesData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold">{summary().total}</div>
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
            <Show when={!deliveriesData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold text-status-selesai">{summary().completed}</div>
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
            <Show when={!deliveriesData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold text-status-proses">{summary().pending}</div>
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
            <Show when={!deliveriesData.loading} fallback={<Skeleton class="h-8 w-20" />}>
              <div class="text-2xl font-bold">{summary().avgLead} Days</div>
              <p class="text-xs text-muted-foreground mt-1">Order to dispatch duration</p>
            </Show>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar Card */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <div class="flex flex-wrap items-end gap-4">
            <div class="min-w-[160px] flex flex-col gap-1">
              <label class="text-xs font-semibold text-muted-foreground">Delivery Status</label>
              <Select<string>
                options={['All Statuses', 'SELESAI', 'PROSES', 'PENDING', 'BATAL']}
                value={filters.values.status() || 'All Statuses'}
                onChange={(val) => filters.setters.status(!val || val === 'All Statuses' ? '' : val)}
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

            <div class="min-w-[160px]">
              <TextField value={filters.values.date()} onChange={filters.setters.date}>
                <TextFieldLabel class="text-xs font-semibold text-muted-foreground">
                  Delivery Date
                </TextFieldLabel>
                <TextFieldInput placeholder="DD/MM/YYYY" class="h-9" />
              </TextField>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-9"
              onClick={filters.reset}
            >
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deliveries Schedule Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">Delivery Shipments & Schedule</CardTitle>
            <CardDescription>
              {deliveriesList().length} tracked shipments across logistics operations
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Shipment Qty</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead class="text-right">Order Qty</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead class="min-w-[120px]">Delivery Progress</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!deliveriesData.loading}
                  fallback={
                    <TableRow>
                      <TableCell colspan={10} class="h-28 text-center text-muted-foreground">
                        <Skeleton class="h-6 w-1/2 mx-auto" />
                      </TableCell>
                    </TableRow>
                  }
                >
                  <Show
                    when={deliveriesList().length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={10} class="h-24 text-center text-muted-foreground">
                          No shipments with delivery dates recorded
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={deliveriesList()}>
                      {(del) => (
                        <TableRow>
                          <TableCell class="font-medium text-xs font-mono">
                            {formatDeliveryDate(del.delivery_date)}
                          </TableCell>
                          <TableCell class="text-xs">
                            {del.shipped_quantity
                              ? del.item.satuan
                                ? `${del.shipped_quantity} ${del.item.satuan}`
                                : del.shipped_quantity
                              : '-'}
                          </TableCell>
                          <TableCell class="font-medium text-xs">{del.item.customer}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">{del.item.area}</TableCell>
                          <TableCell class="text-xs font-medium">{del.item.nama_barang}</TableCell>
                          <TableCell class="text-right text-xs">
                            {del.item.jumlah} {del.item.satuan}
                          </TableCell>
                          <TableCell>
                            <Show when={del.item.lead_time_pengiriman} fallback={<span class="text-muted-foreground">-</span>}>
                              <UiBadge variant="secondary" class="font-mono text-xs">
                                {del.item.lead_time_pengiriman} Days
                              </UiBadge>
                            </Show>
                          </TableCell>
                          <TableCell class="min-w-[120px]">
                            <DeliveryProgress
                              terkirim={del.item.jumlah_terkirim}
                              total={del.item.jumlah}
                            />
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
                            <Badge status={del.item.status_order} />
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
