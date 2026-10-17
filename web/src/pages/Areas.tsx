import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { getAreas, getCustomers } from '../api';
import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';

export const Areas: Component = () => {
  const [areasData] = createResource(getAreas);
  const [selectedArea, setSelectedArea] = createSignal<string>('');

  // Default selected area to first area once loaded
  const currentArea = createMemo(() => {
    if (selectedArea()) return selectedArea();
    if (areasData()?.areas && areasData()!.areas.length > 0) {
      return areasData()!.areas[0].name;
    }
    return '';
  });

  const [areaCustomers] = createResource(
    currentArea,
    (area) => (area ? getCustomers({ area, limit: 5 }) : Promise.resolve({ total: 0, limit: 5, offset: 0, customers: [] }))
  );

  const topAreas = createMemo(() => (areasData()?.areas || []).slice(0, 4));

  return (
    <div>
      <TopBar title="Regional Area Breakdown">
        <Show when={areasData()?.total !== undefined}>
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {areasData()?.total} Active Regions
          </span>
        </Show>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Top 4 Area Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 items-stretch">
          <For each={topAreas()}>
            {(area) => {
              const isSelected = () => currentArea() === area.name;
              return (
                <div
                  class={`bg-surface rounded-lg p-5 flex flex-col justify-between h-full cursor-pointer transition-all shadow-sm ${
                    isSelected()
                      ? 'border-2 border-primary ring-2 ring-primary/10'
                      : 'border border-border hover:border-gray-400'
                  }`}
                  onClick={() => setSelectedArea(area.name)}
                >
                  <div class="mb-2 pb-2 border-b border-border">
                    <h3 class="text-base font-semibold text-text">
                      {area.name}
                    </h3>
                  </div>
                  <div class="space-y-1.5 flex-1">
                    <div class="flex justify-between items-center py-1 text-sm border-b border-border/50">
                      <span class="text-xs text-muted">Orders</span>
                      <span class="font-semibold text-text">{area.total_orders}</span>
                    </div>
                    <div class="flex justify-between items-center py-1 text-sm border-b border-border/50">
                      <span class="text-xs text-muted">Items</span>
                      <span class="font-semibold text-text">{area.total_items}</span>
                    </div>
                    <div class="flex justify-between items-center py-1 text-sm">
                      <span class="text-xs text-muted">Customers</span>
                      <span class="font-semibold text-text">{area.unique_customers}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        {/* Full Area Breakdown Table */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
            <h2 class="text-base font-semibold text-text">All Regional Areas ({areasData()?.areas?.length || 0})</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Area Name</th>
                  <th class="py-2.5 px-3">Customers</th>
                  <th class="py-2.5 px-3">Total Orders</th>
                  <th class="py-2.5 px-3">Total Items</th>
                  <th class="py-2.5 px-3 min-w-[160px]">Status Breakdown</th>
                  <th class="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!areasData.loading}
                  fallback={
                    <tr>
                      <td colspan="6" class="p-8 text-center text-muted text-sm">
                        Loading regional areas...
                      </td>
                    </tr>
                  }
                >
                  <For each={areasData()?.areas}>
                    {(area) => {
                      const isSelected = () => currentArea() === area.name;
                      return (
                        <tr class={`border-b border-border last:border-b-0 transition-colors ${isSelected() ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
                          <td class="py-2.5 px-3 font-semibold">
                            <button
                              type="button"
                              class="bg-transparent border-none p-0 font-semibold text-primary cursor-pointer hover:underline text-sm"
                              onClick={() => setSelectedArea(area.name)}
                            >
                              {area.name}
                            </button>
                          </td>
                          <td class="py-2.5 px-3 text-text">{area.unique_customers}</td>
                          <td class="py-2.5 px-3 text-text">{area.total_orders}</td>
                          <td class="py-2.5 px-3 text-text">{area.total_items}</td>
                          <td class="py-2.5 px-3">
                            <StatusBar statusCounts={area.status_counts} height={16} />
                          </td>
                          <td class="py-2.5 px-3">
                            <A
                              href={`/orders?area=${encodeURIComponent(area.name)}`}
                              class="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                            >
                              View Orders
                            </A>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </section>

        {/* Selected Area Customers Sub-table */}
        <Show when={currentArea()}>
          <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
            <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
              <h2 class="text-base font-semibold text-text">
                Top Customers in <strong class="text-primary">{currentArea()}</strong>
              </h2>
              <A
                href={`/orders?area=${encodeURIComponent(currentArea())}`}
                class="text-primary font-semibold text-xs hover:underline"
              >
                View All Area Orders &rarr;
              </A>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                    <th class="py-2.5 px-3">Customer Name</th>
                    <th class="py-2.5 px-3">Orders</th>
                    <th class="py-2.5 px-3">Items</th>
                    <th class="py-2.5 px-3 min-w-[140px]">Status Breakdown</th>
                    <th class="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={areaCustomers()?.customers && areaCustomers()!.customers.length > 0}
                    fallback={
                      <tr>
                        <td colspan="5" class="p-8 text-center text-muted text-sm">
                          No customers found for {currentArea()}
                        </td>
                      </tr>
                    }
                  >
                    <For each={areaCustomers()?.customers}>
                      {(cust) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 font-medium text-text">{cust.name}</td>
                          <td class="py-2.5 px-3 text-text">{cust.total_orders}</td>
                          <td class="py-2.5 px-3 text-text">{cust.total_items}</td>
                          <td class="py-2.5 px-3">
                            <StatusBar statusCounts={cust.status_counts} height={14} />
                          </td>
                          <td class="py-2.5 px-3">
                            <A
                              href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                              class="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                            >
                              Orders
                            </A>
                          </td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>
          </section>
        </Show>
      </main>
    </div>
  );
};
