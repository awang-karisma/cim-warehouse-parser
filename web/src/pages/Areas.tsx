import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { IconMapPin, IconArrowRight } from '@tabler/icons-solidjs';
import { getAreas, getCustomers } from '../api';
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

const MiniStatusBreakdown: Component<{ counts?: Record<string, number> }> = (props) => {
  const segments = createMemo(() => {
    const counts = props.counts || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return { total: 0, items: [] };

    const selesai = (counts.SELESAI || 0) + (counts.COMPLETED || 0);
    const proses = (counts.PROSES || 0) + (counts.PARTIAL || 0);
    const belumSelesai = counts['BELUM SELESAI'] || 0;
    const batal = (counts.BATAL || 0) + (counts.CANCEL || 0);
    const pending = Math.max(0, total - selesai - proses - belumSelesai - batal);

    const items = [
      { label: 'Selesai', count: selesai, pct: Math.round((selesai / total) * 100), color: 'var(--color-status-selesai, #10b981)' },
      { label: 'Proses', count: proses, pct: Math.round((proses / total) * 100), color: 'var(--color-status-proses, #f59e0b)' },
      { label: 'Belum Selesai', count: belumSelesai, pct: Math.round((belumSelesai / total) * 100), color: 'var(--color-status-belum-selesai, #eab308)' },
      { label: 'Pending', count: pending, pct: Math.round((pending / total) * 100), color: 'var(--color-status-pending, #a855f7)' },
      { label: 'Batal', count: batal, pct: Math.round((batal / total) * 100), color: 'var(--color-status-batal, #ef4444)' },
    ].filter((s) => s.count > 0);

    return { total, items };
  });

  return (
    <Tooltip>
      <TooltipTrigger as="div" class="w-full min-w-[120px] cursor-pointer">
        <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <For each={segments().items}>
            {(item) => (
              <div
                class="h-full transition-all duration-200"
                style={{ width: `${item.pct}%`, 'background-color': item.color }}
              />
            )}
          </For>
        </div>
      </TooltipTrigger>
      <TooltipContent class="p-2 text-xs space-y-1">
        <For each={segments().items}>
          {(item) => (
            <div class="flex items-center gap-1.5">
              <span class="size-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span>{item.label}: {item.count} ({item.pct}%)</span>
            </div>
          )}
        </For>
      </TooltipContent>
    </Tooltip>
  );
};

export const Areas: Component = () => {
  const [areasData] = createResource(getAreas);
  const [selectedArea, setSelectedArea] = createSignal<string>('');

  const currentArea = createMemo(() => {
    if (selectedArea()) return selectedArea();
    if (areasData()?.areas && areasData()!.areas.length > 0) {
      return areasData()!.areas[0].name;
    }
    return '';
  });

  const [areaCustomers] = createResource(
    currentArea,
    (area) =>
      area
        ? getCustomers({ area, limit: 5 })
        : Promise.resolve({ total: 0, limit: 5, offset: 0, customers: [] })
  );

  const topAreas = createMemo(() => (areasData()?.areas || []).slice(0, 4));

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Top 4 Area Cards */}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={topAreas()}>
          {(area) => {
            const isSelected = () => currentArea() === area.name;
            return (
              <Card
                class={`cursor-pointer transition-all ${
                  isSelected()
                    ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedArea(area.name)}
              >
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle class="text-sm font-semibold truncate flex items-center gap-1.5">
                    <IconMapPin class="size-4 text-primary shrink-0" />
                    <span class="truncate">{area.name}</span>
                  </CardTitle>
                  <Badge status={`${area.total_orders} Orders`} pill />
                </CardHeader>
                <CardContent class="space-y-2">
                  <div class="text-xs text-muted-foreground flex justify-between">
                    <span>Customers:</span>
                    <span class="font-medium text-foreground">{area.unique_customers}</span>
                  </div>
                  <div class="text-xs text-muted-foreground flex justify-between">
                    <span>Line Items:</span>
                    <span class="font-medium text-foreground">{area.total_items.toLocaleString()}</span>
                  </div>
                  <div class="pt-1">
                    <MiniStatusBreakdown counts={area.status_counts} />
                  </div>
                </CardContent>
              </Card>
            );
          }}
        </For>
      </div>

      {/* Regional Breakdown Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">Regional Coverage Breakdown</CardTitle>
            <CardDescription>
              {areasData()?.areas?.length || 0} active administrative delivery areas
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div class="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area Name</TableHead>
                  <TableHead class="text-right">Customers</TableHead>
                  <TableHead class="text-right">Total Orders</TableHead>
                  <TableHead class="text-right">Total Items</TableHead>
                  <TableHead class="min-w-[160px]">Status Breakdown</TableHead>
                  <TableHead class="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!areasData.loading}
                  fallback={
                    <TableRow>
                      <TableCell colspan={6} class="h-24 text-center text-muted-foreground">
                        <Skeleton class="h-6 w-3/4 mx-auto" />
                      </TableCell>
                    </TableRow>
                  }
                >
                  <For each={areasData()?.areas}>
                    {(area) => {
                      const isSelected = () => currentArea() === area.name;
                      return (
                        <TableRow
                          class={isSelected() ? 'bg-muted/50 font-medium' : 'hover:bg-muted/20'}
                        >
                          <TableCell>
                            <button
                              type="button"
                              class="text-left font-semibold text-primary hover:underline cursor-pointer"
                              onClick={() => setSelectedArea(area.name)}
                            >
                              {area.name}
                            </button>
                          </TableCell>
                          <TableCell class="text-right">{area.unique_customers}</TableCell>
                          <TableCell class="text-right">{area.total_orders}</TableCell>
                          <TableCell class="text-right">{area.total_items.toLocaleString()}</TableCell>
                          <TableCell>
                            <MiniStatusBreakdown counts={area.status_counts} />
                          </TableCell>
                          <TableCell class="text-right">
                            <Button
                              as={A}
                              href={`/orders?area=${encodeURIComponent(area.name)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              Orders
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </For>
                </Show>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Selected Area Customers Sub-table */}
      <Show when={currentArea()}>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle class="text-base font-semibold">
                Top Customers in <span class="text-primary">{currentArea()}</span>
              </CardTitle>
              <CardDescription>Major recipient accounts in this zone</CardDescription>
            </div>
            <Button
              as={A}
              href={`/orders?area=${encodeURIComponent(currentArea())}`}
              variant="outline"
              size="sm"
              class="gap-1 text-xs"
            >
              <span>View All Area Orders</span>
              <IconArrowRight class="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <div class="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead class="text-right">Orders</TableHead>
                    <TableHead class="text-right">Items</TableHead>
                    <TableHead class="min-w-[140px]">Status Breakdown</TableHead>
                    <TableHead class="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={areaCustomers()?.customers && areaCustomers()!.customers.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={5} class="h-20 text-center text-muted-foreground">
                          <Show when={areaCustomers.loading} fallback={`No customers found for ${currentArea()}`}>
                            <Skeleton class="h-5 w-1/2 mx-auto" />
                          </Show>
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={areaCustomers()?.customers}>
                      {(cust) => (
                        <TableRow>
                          <TableCell class="font-medium">{cust.name}</TableCell>
                          <TableCell class="text-right">{cust.total_orders}</TableCell>
                          <TableCell class="text-right">{cust.total_items}</TableCell>
                          <TableCell>
                            <MiniStatusBreakdown counts={cust.status_counts} />
                          </TableCell>
                          <TableCell class="text-right">
                            <Button
                              as={A}
                              href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              Orders
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
};
