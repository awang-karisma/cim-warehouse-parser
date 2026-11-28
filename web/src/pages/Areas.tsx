import { ROUTES, canAccessRoute } from '~/routes';
import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import { A, useNavigate } from '@solidjs/router';
import { IconMapPin, IconArrowRight } from '@tabler/icons-solidjs';
import { getAreas, getCustomers } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import { Button } from '~/components/ui/button';
import { Badge } from '../components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { MiniStatusBreakdown } from '~/components/MiniStatusBreakdown';
import { AreasMap } from '~/components/AreasMap';
export const Areas: Component = () => {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const [areasData] = createResource(getAreas);
  const [selectedArea, setSelectedArea] = createSignal<string>('');

  const currentArea = createMemo(() => {
    if (selectedArea()) return selectedArea();
    if (areasData()?.areas && areasData()!.areas.length > 0) {
      return areasData()!.areas[0].name;
    }
    return '';
  });

  const [allCustomers] = createResource(
    () => (auth.can('customer:read') ? true : false),
    () => getCustomers({ limit: 1000 })
  );

  const [areaCustomers] = createResource(
    () => auth.can('customer:read') && (currentArea() || false),
    (area) => getCustomers({ area, limit: 5 })
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
                class={`cursor-pointer transition-all min-w-0 ${
                  isSelected()
                    ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedArea(area.name)}
              >
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 min-w-0">
                  <CardTitle class="text-sm font-semibold truncate flex items-center gap-1.5 min-w-0 flex-1">
                    <IconMapPin class="size-4 text-primary shrink-0" />
                    <span class="truncate">{area.name}</span>
                  </CardTitle>
                  <Badge status={t('areas.ordersCount', { count: area.total_orders })} pill class="shrink-0" />
                </CardHeader>
                <CardContent class="space-y-2">
                  <div class="text-xs text-muted-foreground flex justify-between">
                    <span>{t('areas.cardCustomers')}</span>
                    <span class="font-medium text-foreground">{area.unique_customers}</span>
                  </div>
                  <div class="text-xs text-muted-foreground flex justify-between">
                    <span>{t('areas.cardLineItems')}</span>
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

      {/* Interactive NTB Area & Client Map */}
      <AreasMap
        areas={areasData()?.areas || []}
        customers={allCustomers()?.customers || []}
        selectedArea={currentArea()}
        onSelectArea={setSelectedArea}
        canReadCustomers={auth.can('customer:read')}
        canViewOrders={canAccessRoute(auth, ROUTES.orders)}
        onNavigateCustomerOrders={(customerName) => {
          if (canAccessRoute(auth, ROUTES.orders)) {
            navigate(`${ROUTES.orders}?customer=${encodeURIComponent(customerName)}`);
          }
        }}
      />

      {/* Regional Breakdown Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">{t('areas.title')}</CardTitle>
            <CardDescription>
              {t('areas.subtitle', { count: areasData()?.areas?.length || 0 })}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('areas.areaName')}</TableHead>
                  <TableHead class="text-right">{t('areas.customers')}</TableHead>
                  <TableHead class="text-right">{t('areas.totalOrders')}</TableHead>
                  <TableHead class="text-right">{t('areas.totalItems')}</TableHead>
                  <TableHead class="min-w-[160px]">{t('areas.statusBreakdown')}</TableHead>
                  <TableHead class="text-right">{t('areas.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!areasData.loading}
                  fallback={<TableSkeleton columns={6} rows={3} />}
                >
                  <For each={areasData()?.areas}>
                    {(area) => {
                      const isSelected = () => currentArea() === area.name;
                      return (
                        <TableRow
                          class={isSelected() ? 'bg-muted/50 font-medium' : 'hover:bg-muted/20'}
                        >
                          <TableCell>
                            <Show when={auth.can('customer:read')} fallback={<span class="font-semibold">{area.name}</span>}>
                            <button
                              type="button"
                              class="text-left font-semibold text-primary hover:underline cursor-pointer"
                              onClick={() => setSelectedArea(area.name)}
                            >
                              {area.name}
                            </button>
                            </Show>
                          </TableCell>
                          <TableCell class="text-right">{area.unique_customers}</TableCell>
                          <TableCell class="text-right">{area.total_orders}</TableCell>
                          <TableCell class="text-right">{area.total_items.toLocaleString()}</TableCell>
                          <TableCell>
                            <MiniStatusBreakdown counts={area.status_counts} />
                          </TableCell>
                          <TableCell class="text-right">
                            <Show when={canAccessRoute(auth, ROUTES.orders)}>
                            <Button
                              as={A}
                              href={`${ROUTES.orders}?area=${encodeURIComponent(area.name)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              {t('nav.orders')}
                            </Button>
                            </Show>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </For>
                </Show>
              </TableBody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Selected Area Customers Sub-table */}
      <Show when={auth.can('customer:read') && currentArea()}>
        <Card>
          <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
            <div>
              <CardTitle class="text-base font-semibold">
                {t('areas.topCustomers', { area: currentArea() })}
              </CardTitle>
              <CardDescription>{t('areas.topCustomersDesc')}</CardDescription>
            </div>
            <Show when={canAccessRoute(auth, ROUTES.orders)}>
            <Button
              as={A}
              href={`${ROUTES.orders}?area=${encodeURIComponent(currentArea())}`}
              variant="outline"
              size="sm"
              class="gap-1 text-xs self-start sm:self-auto"
            >
              <span>{t('areas.viewAllAreaOrders')}</span>
              <IconArrowRight class="size-3.5" />
            </Button>
            </Show>
          </CardHeader>
          <CardContent>
            <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('orders.customerName')}</TableHead>
                    <TableHead class="text-right">{t('areas.totalOrders')}</TableHead>
                    <TableHead class="text-right">{t('areas.totalItems')}</TableHead>
                    <TableHead class="min-w-[140px]">{t('areas.statusBreakdown')}</TableHead>
                    <TableHead class="text-right">{t('areas.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={!areaCustomers.loading}
                    fallback={<TableSkeleton columns={5} rows={3} />}
                  >
                    <Show
                      when={areaCustomers()?.customers && areaCustomers()!.customers.length > 0}
                      fallback={
                        <TableRow>
                          <TableCell colspan={5} class="h-20 text-center text-muted-foreground">
                            {t('areas.noCustomersForArea', { area: currentArea() })}
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
                            <Show when={canAccessRoute(auth, ROUTES.orders)}>
                            <Button
                              as={A}
                              href={`${ROUTES.orders}?customer=${encodeURIComponent(cust.name)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              {t('nav.orders')}
                            </Button>
                            </Show>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
                </TableBody>
            </DataTable>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
};
