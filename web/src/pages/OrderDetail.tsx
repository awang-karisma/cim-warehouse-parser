import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { IconArrowLeft, IconPackage, IconCalendar, IconBuildingHospital, IconFileText } from '@tabler/icons-solidjs';
import { getOrderById } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';

const ItemProgress: Component<{ terkirim: string | number; total: string | number }> = (props) => {
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

export const OrderDetail: Component = () => {
  const params = useParams<{ id: string }>();
  const [order] = createResource(() => params.id, (id) => getOrderById(id));

  return (
    <div class="flex flex-1 flex-col gap-6">
      <div class="flex items-center justify-between">
        <Button
          as={A}
          href="/orders"
          variant="outline"
          size="sm"
          class="gap-1.5 text-xs h-9"
        >
          <IconArrowLeft class="size-4" />
          <span>Back to Orders</span>
        </Button>
      </div>

      <Show
        when={!order.loading}
        fallback={
          <div class="space-y-4">
            <Skeleton class="h-32 w-full" />
            <Skeleton class="h-64 w-full" />
          </div>
        }
      >
        <Show
          when={order()}
          fallback={
            <Card>
              <CardContent class="p-12 text-center text-muted-foreground">
                <h3 class="text-lg font-bold text-foreground mb-2">Order not found</h3>
                <p class="text-sm text-muted-foreground mb-4">
                  No order exists with ID <code class="font-mono bg-muted px-1.5 py-0.5 rounded">{params.id}</code>
                </p>
                <Button as={A} href="/orders" variant="outline" size="sm">
                  Return to Orders Explorer
                </Button>
              </CardContent>
            </Card>
          }
        >
          {/* Metadata Card & 4-metric Grid */}
          <Card>
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <CardTitle class="text-xl font-bold">{order()!.customer}</CardTitle>
                  <Badge status={order()!.items?.[0]?.status_order || 'PENDING'} pill />
                </div>
                <CardDescription>
                  {order()!.area || 'No regional area specified'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                  <div class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <IconFileText class="size-4 text-primary" />
                    <span>Order ID</span>
                  </div>
                  <div class="text-sm font-semibold">{order()!.id}</div>
                </div>

                <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                  <div class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <IconPackage class="size-4 text-primary" />
                    <span>E-Katalog / Order No.</span>
                  </div>
                  <div class="text-sm font-semibold font-mono">
                    {order()!.order_number || order()!.ecatalog_number || 'N/A'}
                  </div>
                </div>

                <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                  <div class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <IconCalendar class="size-4 text-primary" />
                    <span>Order Date</span>
                  </div>
                  <div class="text-sm font-semibold">{order()!.tanggal}</div>
                </div>

                <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                  <div class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <IconBuildingHospital class="size-4 text-primary" />
                    <span>Total Line Items</span>
                  </div>
                  <div class="text-sm font-semibold">
                    {order()!.total_items || order()!.items?.length || 0} items
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items Table Card */}
          <Card>
            <CardHeader>
              <CardTitle class="text-base font-semibold">
                Order Line Items ({order()!.items?.length || 0})
              </CardTitle>
              <CardDescription>Dispatched and pending inventory units</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-12">#</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead class="text-right">Quantity</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead class="min-w-[120px]">Progress</TableHead>
                      <TableHead class="text-right">Sent / Remaining</TableHead>
                      <TableHead>Status Order</TableHead>
                      <TableHead>Status Barang</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={order()!.items}>
                      {(item, idx) => (
                        <TableRow>
                          <TableCell class="font-mono text-xs text-muted-foreground">
                            {item.row_index || idx() + 1}
                          </TableCell>
                          <TableCell class="font-medium">{item.nama_barang}</TableCell>
                          <TableCell class="text-right font-medium">
                            {item.jumlah} {item.satuan}
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            {item.tanggal_pengiriman ? (
                              <span>
                                {item.tanggal_pengiriman}
                                {item.lead_time_pengiriman ? (
                                  <span class="text-muted-foreground"> ({item.lead_time_pengiriman}d lead)</span>
                                ) : null}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <ItemProgress
                              terkirim={item.jumlah_terkirim}
                              total={item.jumlah}
                            />
                          </TableCell>
                          <TableCell class="text-right font-mono text-xs">
                            {item.jumlah_terkirim || '0'} / {item.belum_terkirim || '0'}
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_order} />
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_barang} />
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground max-w-[200px] truncate">
                            {item.keterangan || item.catatan || '-'}
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </Show>
      </Show>
    </div>
  );
};
