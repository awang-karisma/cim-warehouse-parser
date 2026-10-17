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
          <span class="badge badge-pill badge-primary">
            {data()?.total} Registered Customers
          </span>
        </Show>
      </TopBar>

      <main class="content">
        {/* Search */}
        <div class="search-hero" style={{ 'margin-bottom': '20px' }}>
          <input
            type="text"
            placeholder="Search customers by name (e.g. RSUD, Puskesmas, Klinik)..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>

        {/* 3-Column Card Grid */}
        <Show
          when={!data.loading}
          fallback={<div class="loading-box">Loading customers...</div>}
        >
          <Show
            when={data()?.customers && data()!.customers.length > 0}
            fallback={
              <div class="card empty-box">
                No customers found matching <strong>{search()}</strong>
              </div>
            }
          >
            <div class="grid-3">
              <For each={data()?.customers}>
                {(cust) => (
                  <div class="card" style={{ display: 'flex', 'flex-direction': 'column', 'justify-content': 'space-between' }}>
                    <div>
                      <div class="card-header" style={{ 'margin-bottom': '12px', 'padding-bottom': '8px' }}>
                        <div>
                          <h3 class="card-title" style={{ 'font-size': '15px' }}>
                            🏥 {cust.name}
                          </h3>
                          <span style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>
                            📍 {cust.area || 'Unknown Area'}
                          </span>
                        </div>
                      </div>

                      <div class="prop-list" style={{ 'margin-bottom': '16px' }}>
                        <div class="prop-item">
                          <span class="prop-label">Total Orders</span>
                          <span class="prop-value">{cust.total_orders}</span>
                        </div>
                        <div class="prop-item">
                          <span class="prop-label">Total Line Items</span>
                          <span class="prop-value">{cust.total_items}</span>
                        </div>
                        <div class="prop-item">
                          <span class="prop-label">Latest Order Date</span>
                          <span class="prop-value" style={{ 'font-size': '13px' }}>
                            {cust.last_order_date || '-'}
                          </span>
                        </div>
                      </div>

                      <div style={{ 'margin-bottom': '16px' }}>
                        <div style={{ 'font-size': '11px', color: 'var(--text-muted)', 'margin-bottom': '6px', 'font-weight': '600' }}>
                          ORDER STATUS BREAKDOWN
                        </div>
                        <StatusBar statusCounts={cust.status_counts} height={18} />
                      </div>
                    </div>

                    <A
                      href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                      class="btn btn-secondary"
                      style={{ width: '100%', 'font-size': '12px' }}
                    >
                      View Customer Orders &rarr;
                    </A>
                  </div>
                )}
              </For>
            </div>

            {/* Load More Button */}
            <Show when={data() && data()!.total > limit()}>
              <div style={{ 'text-align': 'center', 'margin-top': '24px' }}>
                <button
                  type="button"
                  class="btn btn-primary"
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
