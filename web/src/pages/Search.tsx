import { ROUTES, canAccessRoute, orderDetailPath } from '~/routes';
import { captureEvent } from '~/posthog';

import { type Component, createResource, Show, For, createMemo } from 'solid-js';
import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import { A } from '@solidjs/router';
import {
  IconSearch,
  IconPackage,
  IconListDetails,
  IconUsers,
  IconArrowRight,
} from '@tabler/icons-solidjs';
import { search } from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { TextField, TextFieldInput } from '~/components/ui/text-field';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';
import { createUrlFilter } from '../utils/tableFilters';

const VALID_TYPES = ['all', 'orders', 'items', 'customers'] as const;
type SearchType = (typeof VALID_TYPES)[number];

export const Search: Component = () => {
  const { t } = useI18n();
  const auth = useAuth();
  const canSearchType = (type: SearchType) => type === 'all' || canAccessRoute(auth, ROUTES[type]);
  const filters = createUrlFilter({
    q: {
      key: 'q',
      defaultValue: '',
      parse: (v) => v ?? '',
      serialize: (v) => v || null,
      debounceMs: 300,
    },
    type: {
      key: 'type',
      defaultValue: 'all' as SearchType,
      parse: (v) => (v && VALID_TYPES.includes(v as SearchType) ? (v as SearchType) : 'all'),
      serialize: (v) => (v === 'all' ? null : v),
    },
  });
  const activeType = () => canSearchType(filters.values.type()) ? filters.values.type() : 'all';

  const activeParams = createMemo(() => {
    const q = filters.debouncedValues.q().trim();
    return q ? { q, type: 'all' } : null;
  });
  const [data] = createResource(activeParams, async (params) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const res = await search(params);
    const resultCount = (res.orders?.total || 0) + (res.items?.total || 0) + (res.customers?.total || 0);
    captureEvent('search_performed', {
      result_count: resultCount,
      zero_results: resultCount === 0,
      duration_ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
    });
    return res;
  });

  const handleSubmit = (e?: Event) => {
    if (e) e.preventDefault();
    filters.flush();
  };

  const totalMatches = createMemo(() => {
    const res = data();
    if (!res) return 0;
    return (res.orders?.total || 0) + (res.items?.total || 0) + (res.customers?.total || 0);
  });
  const currentTabCount = createMemo(() => {
    const type = activeType();
    if (type === 'orders') return data()?.orders?.total || 0;
    if (type === 'items') return data()?.items?.total || 0;
    if (type === 'customers') return data()?.customers?.total || 0;
    return totalMatches();
  });
  const currentQuery = createMemo(() => filters.values.q().trim() || filters.debouncedValues.q().trim());

  const ordersLink = createMemo(() => {
    const q = currentQuery();
		return q ? `${ROUTES.orders}?customer=${encodeURIComponent(q)}` : ROUTES.orders;
  });

  const itemsLink = createMemo(() => {
    const q = currentQuery();
		if (!q) return ROUTES.items;
    const items = data()?.items?.results || [];
    const qLower = q.toLowerCase();
    const matchesNamaBarang = items.some((it) => it.nama_barang?.toLowerCase().includes(qLower));
    const matchesCustomer = items.some((it) => it.customer?.toLowerCase().includes(qLower));

    if (matchesCustomer && !matchesNamaBarang) {
      return `${ROUTES.items}?customer=${encodeURIComponent(q)}`;
    }
    return `${ROUTES.items}?nama_barang=${encodeURIComponent(q)}`;
  });

  const customersLink = createMemo(() => {
    const q = currentQuery();
		return q ? `${ROUTES.customers}?search=${encodeURIComponent(q)}` : ROUTES.customers;
  });
  const highlightMatch = (text: string, q: string) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        <For each={parts}>
          {(part) =>
            part.toLowerCase() === q.toLowerCase() ? (
              <mark class="bg-amber-200 text-amber-900 rounded px-0.5">{part}</mark>
            ) : (
              part
            )
          }
        </For>
      </>
    );
  };

  return (
    <div class="flex flex-1 flex-col gap-6">
      {/* Search Hero Card */}
      <Card>
        <CardContent class="p-4 md:p-6">
          <form class="flex flex-col sm:flex-row sm:items-center gap-3" onSubmit={handleSubmit}>
            <div class="relative flex-1 w-full">
              <TextField value={filters.values.q()} onChange={filters.setters.q} class="w-full">
                <div class="relative flex items-center w-full">
                  <IconSearch class="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
                  <TextFieldInput
                    placeholder={t('searchPage.placeholder')}
                    class="pl-9 h-11 text-base w-full"
                  />
                </div>
              </TextField>
            </div>
            <Button type="submit" class="h-11 px-6 w-full sm:w-auto">
              {t('common.search')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabs Filter Bar (Tasks faceted pattern) */}
      <Tabs
        value={activeType()}
        onChange={(val) => { if (VALID_TYPES.includes(val as SearchType) && canSearchType(val as SearchType)) filters.setters.type(val as SearchType); }}
        class="w-full"
      >
        <div class="w-full overflow-x-auto pb-1 mb-4">
          <TabsList class="inline-flex w-max">
            <TabsTrigger value="all">{t('searchPage.allResults', { count: totalMatches() })}</TabsTrigger>
            <Show when={canSearchType('orders')}>
            <TabsTrigger value="orders">
              {t('searchPage.ordersTab', { count: data()?.orders?.total || 0 })}
            </TabsTrigger>
            </Show>
            <Show when={canSearchType('items')}>
            <TabsTrigger value="items">
              {t('searchPage.lineItemsTab', { count: data()?.items?.total || 0 })}
            </TabsTrigger>
            </Show>
            <Show when={canSearchType('customers')}>
            <TabsTrigger value="customers">
              {t('searchPage.customersTab', { count: data()?.customers?.total || 0 })}
            </TabsTrigger>
            </Show>
          </TabsList>
        </div>

        {/* Global Loading Indicator */}
        <Show when={data.loading}>
          <div class="space-y-4">
            <Skeleton class="h-28 w-full" />
            <Skeleton class="h-44 w-full" />
          </div>
        </Show>

        <Show when={!data.loading && !filters.debouncedValues.q().trim()}>
          <Card>
            <CardContent class="p-12 text-center text-muted-foreground">
              <IconSearch class="size-8 mx-auto mb-3 opacity-40" />
              <p class="font-medium text-foreground">{t('searchPage.emptyPromptTitle')}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {t('searchPage.emptyPromptDesc')}
              </p>
            </CardContent>
          </Card>
        </Show>

        <Show when={!data.loading && filters.debouncedValues.q().trim() && currentTabCount() === 0}>
          <Card>
            <CardContent class="p-12 text-center text-muted-foreground">
              <p>
                {t('searchPage.noResultsFound', {
                  type: activeType() === 'all'
                    ? t('searchPage.results')
                    : activeType() === 'orders'
                    ? t('searchPage.orders')
                    : activeType() === 'items'
                    ? t('searchPage.items')
                    : t('searchPage.customers'),
                  query: filters.debouncedValues.q(),
                })}
              </p>
            </CardContent>
          </Card>
        </Show>

        {/* Orders Results Section */}
        <Show
          when={
            !data.loading &&
            canSearchType('orders') && (activeType() === 'all' || activeType() === 'orders') &&
            data()?.orders &&
            data()!.orders.results.length > 0
          }
        >
          <Card class="mb-6">
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
              <div class="flex items-center gap-2">
                <IconPackage class="size-4 text-primary" />
                <CardTitle class="text-base font-semibold">
                  Orders ({data()!.orders.total})
                </CardTitle>
              </div>
              <Button
                as={A}
                href={ordersLink()}
                variant="ghost"
                size="sm"
                class="gap-1 text-xs text-primary self-start sm:self-auto"
              >
                {t('searchPage.viewInOrders')} <IconArrowRight class="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.orderId')}</TableHead>
                      <TableHead>{t('dashboard.customer')}</TableHead>
                      <TableHead>{t('dashboard.date')}</TableHead>
                      <TableHead>{t('searchPage.matchedItems')}</TableHead>
                      <TableHead class="text-right">{t('common.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={data()!.orders.results}>
                      {(ord) => (
                        <TableRow>
                          <TableCell>
                            <A
								href={orderDetailPath(ord.id)}
                              class="font-mono text-xs font-semibold text-primary hover:underline"
                            >
                              {ord.id}
                            </A>
                          </TableCell>
                          <TableCell class="font-medium">
                            {highlightMatch(ord.customer, filters.debouncedValues.q())}
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground">{ord.tanggal}</TableCell>
                          <TableCell>
                            <div class="flex flex-wrap gap-1">
                              <For each={ord.matched_items || []}>
                                {(item) => (
                                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-secondary text-secondary-foreground font-medium">
                                    {highlightMatch(item, filters.debouncedValues.q())}
                                  </span>
                                )}
                              </For>
                            </div>
                          </TableCell>
                          <TableCell class="text-right">
                            <Button
                              as={A}
								href={orderDetailPath(ord.id)}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              {t('searchPage.detail')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
              </DataTable>
            </CardContent>
          </Card>
        </Show>

        {/* Line Items Results Section */}
        <Show
          when={
            !data.loading &&
            canSearchType('items') && (activeType() === 'all' || activeType() === 'items') &&
            data()?.items &&
            data()!.items.results.length > 0
          }
        >
          <Card class="mb-6">
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
              <div class="flex items-center gap-2">
                <IconListDetails class="size-4 text-primary" />
                <CardTitle class="text-base font-semibold">
                  Line Items ({data()!.items.total})
                </CardTitle>
              </div>
              <Button
                as={A}
                href={itemsLink()}
                variant="ghost"
                size="sm"
                class="gap-1 text-xs text-primary self-start sm:self-auto"
              >
                {t('searchPage.viewInItems')} <IconArrowRight class="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.customer')}</TableHead>
                      <TableHead>{t('items.itemName')}</TableHead>
                      <TableHead class="text-right">{t('items.qty')}</TableHead>
                      <TableHead>{t('dashboard.status')}</TableHead>
                      <TableHead class="text-right">{t('common.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={data()!.items.results}>
                      {(item) => (
                        <TableRow>
                          <TableCell class="font-medium">
                            {highlightMatch(item.customer, filters.debouncedValues.q())}
                          </TableCell>
                          <TableCell class="font-medium">
                            {highlightMatch(item.nama_barang, filters.debouncedValues.q())}
                          </TableCell>
                          <TableCell class="text-right font-medium">
                            {item.jumlah}
                          </TableCell>
                          <TableCell>
                            <Badge status={item.status_order} kind="order" />
                          </TableCell>
                          <TableCell class="text-right">
                            <Button
                              as={A}
                              href={`${ROUTES.items}?nama_barang=${encodeURIComponent(item.nama_barang)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              {t('searchPage.catalog')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
              </DataTable>
            </CardContent>
          </Card>
        </Show>

        {/* Customers Results Section */}
        <Show
          when={
            !data.loading &&
            canSearchType('customers') && (activeType() === 'all' || activeType() === 'customers') &&
            data()?.customers &&
            data()!.customers.results.length > 0
          }
        >
          <Card>
            <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
              <div class="flex items-center gap-2">
                <IconUsers class="size-4 text-primary" />
                <CardTitle class="text-base font-semibold">
                  Customers ({data()!.customers.total})
                </CardTitle>
              </div>
              <Button
                as={A}
                href={customersLink()}
                variant="ghost"
                size="sm"
                class="gap-1 text-xs text-primary self-start sm:self-auto"
              >
                {t('searchPage.viewInCustomers')} <IconArrowRight class="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={data()!.customers.results}>
                  {(cust) => (
                    <Card class="flex flex-col justify-between p-4 bg-muted/20 min-w-0">
                      <div>
                        <div class="font-semibold text-sm mb-1 break-words">
                          {highlightMatch(cust.name, filters.debouncedValues.q())}
                        </div>
                        <p class="text-xs text-muted-foreground mb-3 break-words">{cust.area || t('customers.unknownArea')}</p>
                        <div class="flex justify-between text-xs py-1 border-t">
                          <span class="text-muted-foreground">{t('customers.totalOrdersLabel')}</span>
                          <span class="font-medium">{cust.total_orders}</span>
                        </div>
                      </div>
                      <Show when={canAccessRoute(auth, ROUTES.orders)}>
                      <div class="pt-3 border-t mt-2">
                        <Button
                          as={A}
                          href={`${ROUTES.orders}?customer=${encodeURIComponent(cust.name)}`}
                          variant="outline"
                          size="sm"
                          class="w-full text-xs h-8"
                        >
                          {t('searchPage.viewCustomerOrders')}
                        </Button>
                      </div>
                      </Show>
                    </Card>
                  )}
                </For>
              </div>
            </CardContent>
          </Card>
        </Show>
      </Tabs>
    </div>
  );
};
