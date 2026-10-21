import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconPackage,
  IconListDetails,
  IconUsers,
  IconMapPin,
  IconArrowRight,
  IconActivity,
} from '@tabler/icons-solidjs';
import { getStats, getOrders, getSyncHistory, getStatus } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { getDominantOrderStatus } from './Orders';

export const Dashboard: Component = () => {
  const [stats] = createResource(getStats);
  const [recentOrders] = createResource(() => getOrders({ limit: 5 }));
  const [syncHistory] = createResource(() => getSyncHistory({ limit: 5 }));
  const [workerStatus] = createResource(getStatus);

  const formatSyncTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' WITA';
  };

  const statusSegments = createMemo(() => {
    const counts = stats()?.status_counts || {};
    const total = Object.values(counts).reduce((acc, c) => acc + c, 0);
    if (total === 0) return { total: 0, segments: [] };

    let selesai = 0;
    let proses = 0;
    let belumSelesai = 0;
    let pending = 0;
    let batal = 0;

    for (const [k, v] of Object.entries(counts)) {
      const upper = k ? k.trim().toUpperCase() : '';
      if (upper === 'SELESAI' || upper === 'COMPLETED') {
        selesai += v;
      } else if (upper === 'PROSES' || upper === 'PARTIAL') {
        proses += v;
      } else if (upper === 'BELUM SELESAI') {
        belumSelesai += v;
      } else if (upper === 'BATAL' || upper === 'CANCEL') {
        batal += v;
      } else {
        pending += v;
      }
    }

    const pctSelesai = Math.round((selesai / total) * 100);
    const pctProses = Math.round((proses / total) * 100);
    const pctBelumSelesai = Math.round((belumSelesai / total) * 100);
    const pctBatal = Math.round((batal / total) * 100);
    const pctPending = Math.max(0, 100 - pctSelesai - pctProses - pctBelumSelesai - pctBatal);

    const segments = [
      { key: 'SELESAI', label: 'Selesai', count: selesai, pct: pctSelesai, color: 'var(--color-status-selesai, #10b981)' },
      { key: 'PROSES', label: 'Proses', count: proses, pct: pctProses, color: 'var(--color-status-proses, #f59e0b)' },
      { key: 'BELUM SELESAI', label: 'Belum Selesai', count: belumSelesai, pct: pctBelumSelesai, color: 'var(--color-status-belum-selesai, #eab308)' },
      { key: 'PENDING', label: 'Pending', count: pending, pct: pctPending, color: 'var(--color-status-pending, #a855f7)' },
      { key: 'BATAL', label: 'Batal', count: batal, pct: pctBatal, color: 'var(--color-status-batal, #ef4444)' },
    ].filter((s) => s.count > 0);

    return { total, segments };
  });

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* 4 KPI Cards (Solid-UI Dashboard Example) */}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "0ms" }}>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Orders
            </CardTitle>
            <IconPackage class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Show when={!stats.loading} fallback={<Skeleton class="h-8 w-24" />}>
              <div class="text-2xl font-bold">{stats()?.total_orders?.toLocaleString() ?? '0'}</div>
              <p class="text-xs text-muted-foreground mt-1">Aggregated order documents</p>
            </Show>
          </CardContent>
        </Card>

        <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "75ms" }}>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Line Items
            </CardTitle>
            <IconListDetails class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Show when={!stats.loading} fallback={<Skeleton class="h-8 w-24" />}>
              <div class="text-2xl font-bold">{stats()?.total_items?.toLocaleString() ?? '0'}</div>
              <p class="text-xs text-muted-foreground mt-1">Individual product lines</p>
            </Show>
          </CardContent>
        </Card>

        <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "150ms" }}>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Unique Customers
            </CardTitle>
            <IconUsers class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Show when={!stats.loading} fallback={<Skeleton class="h-8 w-24" />}>
              <div class="text-2xl font-bold">{stats()?.unique_customers?.toLocaleString() ?? '0'}</div>
              <p class="text-xs text-muted-foreground mt-1">Hospitals, clinics & stores</p>
            </Show>
          </CardContent>
        </Card>

        <Card class="animate-[card-enter_400ms_ease-out_both]" style={{ "animation-delay": "225ms" }}>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Coverage Areas
            </CardTitle>
            <IconMapPin class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Show when={!stats.loading} fallback={<Skeleton class="h-8 w-24" />}>
              <div class="text-2xl font-bold">{stats()?.unique_areas?.toLocaleString() ?? '0'}</div>
              <p class="text-xs text-muted-foreground mt-1">Active delivery zones</p>
            </Show>
          </CardContent>
        </Card>
      </div>

      {/* 2-Column Grid: Status Distribution + Recent Sync */}
      <div class="grid gap-6 lg:grid-cols-2 items-stretch">
        {/* Status Distribution */}
        <Card class="flex flex-col">
          <CardHeader>
            <CardTitle class="text-base font-semibold">Order Status Distribution</CardTitle>
            <CardDescription>Breakdown across active fulfillment phases</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-1 flex-col gap-4">
            <Show
              when={statusSegments().segments.length > 0}
              fallback={<p class="text-sm text-muted-foreground py-4">No order distribution data</p>}
            >
              <Tooltip>
                <TooltipTrigger as="div" class="w-full cursor-pointer">
                  <div class="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                    <For each={statusSegments().segments}>
                      {(seg) => (
                        <div
                          class="h-full transition-all duration-300"
                          style={{ width: `${seg.pct}%`, 'background-color': seg.color }}
                        />
                      )}
                    </For>
                  </div>
                </TooltipTrigger>
                <TooltipContent class="p-3 text-xs space-y-1.5">
                  <div class="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                    Status Breakdown ({statusSegments().total} total)
                  </div>
                  <For each={statusSegments().segments}>
                    {(seg) => (
                      <div class="flex items-center gap-2">
                        <span class="size-2 rounded-full shrink-0" style={{ background: seg.color }} />
                        <span>{seg.label}:</span>
                        <span class="font-semibold">{seg.count}</span>
                        <span class="text-muted-foreground">({seg.pct}%)</span>
                      </div>
                    )}
                  </For>
                </TooltipContent>
              </Tooltip>

              <div class="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead class="text-right">Count</TableHead>
                      <TableHead class="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={Object.entries(stats()?.status_counts || {})}>
                      {([status, count]) => {
                        const total = stats()?.total_items || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <TableRow>
                            <TableCell>
                              <Badge status={status} kind="order" />
                            </TableCell>
                            <TableCell class="text-right font-medium">{count.toLocaleString()}</TableCell>
                            <TableCell class="text-right text-muted-foreground">{pct}%</TableCell>
                          </TableRow>
                        );
                      }}
                    </For>
                  </TableBody>
                </Table>
              </div>
            </Show>
          </CardContent>
        </Card>

        {/* Recent Sync Activity */}
        <Card class="flex flex-col">
          <CardHeader class="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle class="text-base font-semibold">Recent Sync Activity</CardTitle>
              <CardDescription>
                {workerStatus()?.status === 'SYNCING'
                  ? 'Sync currently in progress'
                  : `Last synced at ${formatSyncTime(workerStatus()?.last_sync)}`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" as={A} href="/sync" class="gap-1 text-xs text-primary">
              View All <IconArrowRight class="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent class="flex-1">
            <div class="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead class="text-right">Items</TableHead>
                    <TableHead class="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={!syncHistory.loading}
                    fallback={<TableSkeleton columns={4} rows={3} />}
                  >
                    <Show
                      when={syncHistory()?.records && syncHistory()!.records.length > 0}
                      fallback={
                        <TableRow>
                          <TableCell colspan={4} class="h-24 text-center text-muted-foreground">
                            No sync records yet
                          </TableCell>
                        </TableRow>
                      }
                    >
                    <For each={syncHistory()?.records}>
                      {(rec) => (
                        <TableRow>
                          <TableCell class="text-muted-foreground font-mono text-xs">
                            {formatSyncTime(rec.synced_at)}
                          </TableCell>
                          <TableCell>
                            <Badge status={rec.status} kind="sync" />
                          </TableCell>
                          <TableCell class="text-right font-medium">{rec.items_count}</TableCell>
                          <TableCell class="text-right text-muted-foreground font-mono text-xs">
                            {rec.duration_ms > 0 ? `${rec.duration_ms}ms` : '<1s'}
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

      {/* Recent Orders Section */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">Recent Orders</CardTitle>
            <CardDescription>Latest customer purchase orders from warehouse mirror</CardDescription>
          </div>
          <Button variant="outline" size="sm" as={A} href="/orders" class="gap-1 text-xs">
            View All Orders <IconArrowRight class="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Order / E-Katalog</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead class="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!recentOrders.loading}
                  fallback={<TableSkeleton columns={7} rows={3} />}
                >
                  <Show
                    when={recentOrders()?.orders && recentOrders()!.orders.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={7} class="h-24 text-center text-muted-foreground">
                          No orders found
                        </TableCell>
                      </TableRow>
                    }
                  >
                  <For each={recentOrders()?.orders}>
                    {(order) => {
                      const firstStatus = getDominantOrderStatus(order.items);
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
                          <TableCell class="text-muted-foreground text-xs">{order.tanggal}</TableCell>
                          <TableCell class="font-medium">{order.customer}</TableCell>
                          <TableCell class="text-muted-foreground text-xs">{order.area}</TableCell>
                          <TableCell class="text-right font-medium">
                            {order.total_items || order.items?.length || 0}
                          </TableCell>
                          <TableCell>
                            <Badge status={firstStatus} kind="order" />
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
        </CardContent>
      </Card>
    </div>
  );
};
