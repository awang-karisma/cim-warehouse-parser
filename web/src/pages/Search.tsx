import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconSearch,
  IconPackage,
  IconListDetails,
  IconUsers,
} from '@tabler/icons-solidjs';
import { search } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { createDebouncedSignal } from '../utils/debounce';

export const Search: Component = () => {
  const [queryInput, debouncedQuery, setQueryInput, flushQuery] = createDebouncedSignal('', 300);
  const [filterType, setFilterType] = createSignal<'all' | 'orders' | 'items' | 'customers'>('all');

  const activeParams = createMemo(() => {
    const q = debouncedQuery().trim();
    return q ? { q, type: filterType() } : null;
  });

  const [data] = createResource(activeParams, (params) => search(params));

  const handleSubmit = (e?: Event) => {
    if (e) e.preventDefault();
    flushQuery();
  };

  const totalMatches = createMemo(() => {
    const res = data();
    if (!res) return 0;
    return (res.orders?.total || 0) + (res.items?.total || 0) + (res.customers?.total || 0);
  });

  const highlightMatch = (text: string, q: string) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part) =>
          part.toLowerCase() === q.toLowerCase() ? (
            <mark class="bg-yellow-200 text-text px-0.5 rounded">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div>
      <TopBar title="Global Search" />

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Search Hero Input */}
        <form onSubmit={handleSubmit} class="relative mb-5">
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted">
              <IconSearch size={20} stroke={1.8} aria-hidden="true" />
            </span>
            <input
              type="text"
              class="w-full pl-11 pr-28 py-3.5 text-base border-2 border-border rounded-lg outline-none bg-surface text-text focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all shadow-sm"
              placeholder="Search across orders, items, customers, catalog numbers..."
              value={queryInput()}
              onInput={(e) => setQueryInput(e.currentTarget.value)}
            />
            <button
              type="submit"
              class="absolute inset-y-1.5 right-1.5 px-4 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover cursor-pointer transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Filter Chips */}
        <div class="flex items-center gap-2 mb-5 flex-wrap">
          <button
            type="button"
            class={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterType() === 'all'
                ? 'bg-primary text-white'
                : 'bg-surface text-text border border-border hover:bg-gray-50'
            }`}
            onClick={() => setFilterType('all')}
          >
            All Results
          </button>
          <button
            type="button"
            class={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterType() === 'orders'
                ? 'bg-primary text-white'
                : 'bg-surface text-text border border-border hover:bg-gray-50'
            }`}
            onClick={() => setFilterType('orders')}
          >
            Orders Only
          </button>
          <button
            type="button"
            class={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterType() === 'items'
                ? 'bg-primary text-white'
                : 'bg-surface text-text border border-border hover:bg-gray-50'
            }`}
            onClick={() => setFilterType('items')}
          >
            Line Items Only
          </button>
          <button
            type="button"
            class={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterType() === 'customers'
                ? 'bg-primary text-white'
                : 'bg-surface text-text border border-border hover:bg-gray-50'
            }`}
            onClick={() => setFilterType('customers')}
          >
            Customers Only
          </button>
        </div>

        {/* Results Area */}
        <Show when={debouncedQuery().trim()}>
          <Show
            when={!data.loading}
            fallback={<div class="p-10 text-center text-muted text-sm">Searching across warehouse database...</div>}
          >
            <div class="mb-4 text-xs text-muted">
              Found <strong class="text-text font-semibold">{totalMatches()}</strong> total matches for "
              <strong class="text-text font-semibold">{debouncedQuery()}</strong>"
            </div>

            {/* 1. Matched Orders */}
            <Show when={filterType() === 'all' || filterType() === 'orders'}>
              <Show when={data()?.orders?.results && data()!.orders.results.length > 0}>
                <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-5">
                  <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                    <IconPackage size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
                    <h3 class="text-base font-semibold text-text">Matched Orders ({data()!.orders.total})</h3>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                          <th class="py-2.5 px-3">Order ID</th>
                          <th class="py-2.5 px-3">Customer</th>
                          <th class="py-2.5 px-3">Date</th>
                          <th class="py-2.5 px-3">Matched Line Items</th>
                          <th class="py-2.5 px-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={data()!.orders.results}>
                          {(ord) => (
                            <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                              <td class="py-2.5 px-3">
                                <A href={`/orders/${ord.id}`} class="text-primary font-semibold hover:underline">
                                  {ord.id}
                                </A>
                              </td>
                              <td class="py-2.5 px-3 font-semibold text-text">
                                {highlightMatch(ord.customer, submittedQuery())}
                              </td>
                              <td class="py-2.5 px-3 text-text">{ord.tanggal}</td>
                              <td class="py-2.5 px-3">
                                <Show
                                  when={ord.matched_items && ord.matched_items.length > 0}
                                  fallback={<span class="text-muted">-</span>}
                                >
                                  <div class="flex flex-wrap gap-1">
                                    <For each={ord.matched_items}>
                                      {(item) => (
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                          {highlightMatch(item, submittedQuery())}
                                        </span>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </td>
                              <td class="py-2.5 px-3">
                                <A
                                  href={`/orders/${ord.id}`}
                                  class="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                                >
                                  Detail
                                </A>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </section>
              </Show>
            </Show>

            {/* 2. Matched Line Items */}
            <Show when={filterType() === 'all' || filterType() === 'items'}>
              <Show when={data()?.items?.results && data()!.items.results.length > 0}>
                <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-5">
                  <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                    <IconListDetails size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
                    <h3 class="text-base font-semibold text-text">Matched Line Items ({data()!.items.total})</h3>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                          <th class="py-2.5 px-3">Row</th>
                          <th class="py-2.5 px-3">Customer</th>
                          <th class="py-2.5 px-3">Item Name</th>
                          <th class="py-2.5 px-3">Qty</th>
                          <th class="py-2.5 px-3">Status Order</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={data()!.items.results}>
                          {(item) => (
                            <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                              <td class="py-2.5 px-3 text-muted">{item.row_index}</td>
                              <td class="py-2.5 px-3 font-medium text-text">
                                {highlightMatch(item.customer, submittedQuery())}
                              </td>
                              <td class="py-2.5 px-3 font-semibold text-text">
                                {highlightMatch(item.nama_barang, submittedQuery())}
                              </td>
                              <td class="py-2.5 px-3 text-text">{item.jumlah}</td>
                              <td class="py-2.5 px-3">
                                <Badge status={item.status_order} />
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </section>
              </Show>
            </Show>

            {/* 3. Matched Customers */}
            <Show when={filterType() === 'all' || filterType() === 'customers'}>
              <Show when={data()?.customers?.results && data()!.customers.results.length > 0}>
                <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
                  <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                    <IconUsers size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
                    <h3 class="text-base font-semibold text-text">Matched Customers ({data()!.customers.total})</h3>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <For each={data()!.customers.results}>
                      {(cust) => (
                        <div class="bg-surface rounded-lg border border-border p-4 flex flex-col justify-between">
                          <div>
                            <h4 class="text-base font-semibold text-text mb-1">
                              {highlightMatch(cust.name, submittedQuery())}
                            </h4>
                            <span class="text-xs text-muted block mb-3">
                              {cust.area || 'Unknown Area'}
                            </span>
                            <div class="mb-3">
                              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium">
                                {cust.total_orders} Orders
                              </span>
                            </div>
                          </div>
                          <A
                            href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                            class="inline-flex items-center justify-center w-full px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                          >
                            View Orders
                          </A>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            </Show>

            <Show when={totalMatches() === 0}>
              <div class="bg-surface rounded-lg border border-border shadow-sm p-10 text-center">
                <h3 class="text-base font-bold text-text mb-2">No results found</h3>
                <p class="text-sm text-muted">
                  No orders, items, or customers matched "<strong class="text-text">{submittedQuery()}</strong>".
                </p>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
};
