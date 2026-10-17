import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { getCustomers } from '../api';
import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';

export const Customers: Component = () => {
  const [search, setSearch] = createSignal('');
  const [limit, setLimit] = createSignal(24);

  const [data] = createResource(
    () => ({ search: search(), limit: limit() }),
    (params) => getCustomers({ search: params.search, limit: params.limit, offset: 0 })
  );

  return (
    <div>
      <TopBar title="Customer View">
        <Show when={data()?.total !== undefined}>
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {data()?.total} Registered Customers
          </span>
        </Show>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Search */}
        <div class="relative mb-5">
          <input
            type="text"
            class="w-full px-4 py-3 text-base border-2 border-border rounded-lg outline-none bg-surface text-text focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all"
            placeholder="Search customers by name (e.g. RSUD, Puskesmas, Klinik)..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>

        {/* 3-Column Card Grid */}
        <Show
          when={!data.loading}
          fallback={<div class="p-10 text-center text-muted text-sm">Loading customers...</div>}
        >
          <Show
            when={data()?.customers && data()!.customers.length > 0}
            fallback={
              <div class="bg-surface rounded-lg border border-border shadow-sm p-10 text-center text-muted text-sm">
                No customers found matching <strong class="text-text">{search()}</strong>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              <For each={data()?.customers}>
                {(cust) => (
                  <div class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col justify-between h-full">
                    <div>
                      <div class="mb-3 pb-2 border-b border-border">
                        <h3 class="text-base font-semibold text-text">
                          {cust.name}
                        </h3>
                        <span class="text-xs text-muted">
                          {cust.area || 'Unknown Area'}
                        </span>
                      </div>

                      <div class="space-y-2 mb-4">
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Total Orders</span>
                          <span class="font-semibold text-text">{cust.total_orders}</span>
                        </div>
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Total Line Items</span>
                          <span class="font-semibold text-text">{cust.total_items}</span>
                        </div>
                        <div class="flex justify-between items-center py-1.5 border-b border-border text-sm">
                          <span class="text-muted text-xs">Latest Order Date</span>
                          <span class="font-semibold text-text text-xs">
                            {cust.last_order_date || '-'}
                          </span>
                        </div>
                      </div>

                      <div class="mb-4">
                        <div class="text-[11px] text-muted mb-1.5 font-semibold uppercase tracking-wider">
                          ORDER STATUS BREAKDOWN
                        </div>
                        <StatusBar statusCounts={cust.status_counts} height={18} />
                      </div>
                    </div>

                    <A
                      href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                      class="inline-flex items-center justify-center w-full px-3 py-2 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors mt-2"
                    >
                      View Customer Orders &rarr;
                    </A>
                  </div>
                )}
              </For>
            </div>

            {/* Load More Button */}
            <Show when={data() && data()!.total > limit()}>
              <div class="text-center mt-6">
                <button
                  type="button"
                  class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover cursor-pointer transition-colors"
                  onClick={() => setLimit((prev) => prev + 24)}
                >
                  Load More Customers ({data()!.total - limit()} remaining)
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
};
