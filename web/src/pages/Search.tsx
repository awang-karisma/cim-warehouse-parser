import { type Component, createResource, Show, For, createMemo } from 'solid-js';
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

  const activeParams = createMemo(() => {
    const q = filters.debouncedValues.q().trim();
    return q ? { q, type: 'all' } : null;
  });
  const [data] = createResource(activeParams, (params) => search(params));

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
    const type = filters.values.type();
    if (type === 'orders') return data()?.orders?.total || 0;
    if (type === 'items') return data()?.items?.total || 0;
    if (type === 'customers') return data()?.customers?.total || 0;
    return totalMatches();
  });
  const currentQuery = createMemo(() => filters.values.q().trim() || filters.debouncedValues.q().trim());

  const ordersLink = createMemo(() => {
    const q = currentQuery();
    return q ? `/orders?customer=${encodeURIComponent(q)}` : '/orders';
  });

  const itemsLink = createMemo(() => {
    const q = currentQuery();
    if (!q) return '/items';
    const items = data()?.items?.results || [];
    const qLower = q.toLowerCase();
    const matchesNamaBarang = items.some((it) => it.nama_barang?.toLowerCase().includes(qLower));
    const matchesCustomer = items.some((it) => it.customer?.toLowerCase().includes(qLower));

    if (matchesCustomer && !matchesNamaBarang) {
      return `/items?customer=${encodeURIComponent(q)}`;
    }
    return `/items?nama_barang=${encodeURIComponent(q)}`;
  });

  const customersLink = createMemo(() => {
    const q = currentQuery();
    return q ? `/customers?search=${encodeURIComponent(q)}` : '/customers';
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
                    placeholder="Search across orders, line items, customer names, or item descriptions..."
                    class="pl-9 h-11 text-base w-full"
                  />
                </div>
              </TextField>
            </div>
            <Button type="submit" class="h-11 px-6 w-full sm:w-auto">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabs Filter Bar (Tasks faceted pattern) */}
      <Tabs
        value={filters.values.type()}
        onChange={(val) => filters.setters.type(val as SearchType)}
        class="w-full"
      >
        <div class="w-full overflow-x-auto pb-1 mb-4">
          <TabsList class="inline-flex w-max">
            <TabsTrigger value="all">All Results ({totalMatches()})</TabsTrigger>
            <TabsTrigger value="orders">
              Orders ({data()?.orders?.total || 0})
            </TabsTrigger>
            <TabsTrigger value="items">
              Line Items ({data()?.items?.total || 0})
            </TabsTrigger>
            <TabsTrigger value="customers">
              Customers ({data()?.customers?.total || 0})
            </TabsTrigger>
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
              <p class="font-medium text-foreground">Type a query to search across the database</p>
              <p class="text-xs text-muted-foreground mt-1">
                Searches orders, line items, customer names, and notes simultaneously
              </p>
            </CardContent>
          </Card>
        </Show>

        <Show when={!data.loading && filters.debouncedValues.q().trim() && currentTabCount() === 0}>
          <Card>
            <CardContent class="p-12 text-center text-muted-foreground">
              <p>
                No {filters.values.type() === 'all' ? 'results' : filters.values.type()} found matching{' '}
                <span class="font-medium text-foreground">"{filters.debouncedValues.q()}"</span>
              </p>
            </CardContent>
          </Card>
        </Show>

        {/* Orders Results Section */}
        <Show
          when={
            !data.loading &&
            (filters.values.type() === 'all' || filters.values.type() === 'orders') &&
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
                View in Orders <IconArrowRight class="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Matched Items</TableHead>
                      <TableHead class="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={data()!.orders.results}>
                      {(ord) => (
                        <TableRow>
                          <TableCell>
                            <A
                              href={`/orders/${ord.id}`}
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
                              href={`/orders/${ord.id}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              Detail
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
            (filters.values.type() === 'all' || filters.values.type() === 'items') &&
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
                View in Items <IconArrowRight class="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead class="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead class="text-right">Action</TableHead>
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
                              href={`/items?nama_barang=${encodeURIComponent(item.nama_barang)}`}
                              variant="ghost"
                              size="sm"
                              class="text-xs"
                            >
                              Catalog
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
            (filters.values.type() === 'all' || filters.values.type() === 'customers') &&
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
                View in Customers <IconArrowRight class="size-3.5" />
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
                        <p class="text-xs text-muted-foreground mb-3 break-words">{cust.area || 'Unknown Area'}</p>
                        <div class="flex justify-between text-xs py-1 border-t">
                          <span class="text-muted-foreground">Total Orders:</span>
                          <span class="font-medium">{cust.total_orders}</span>
                        </div>
                      </div>
                      <div class="pt-3 border-t mt-2">
                        <Button
                          as={A}
                          href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                          variant="outline"
                          size="sm"
                          class="w-full text-xs h-8"
                        >
                          View Customer Orders
                        </Button>
                      </div>
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
