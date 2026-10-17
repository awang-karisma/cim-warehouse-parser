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
          <span class="badge badge-pill badge-primary">
            {areasData()?.total} Active Regions
          </span>
        </Show>
      </TopBar>

      <main class="content">
        {/* Top 4 Area Cards */}
        <div class="grid-4">
          <For each={topAreas()}>
            {(area) => (
              <div
                class="card"
                style={{
                  cursor: 'pointer',
                  border: currentArea() === area.name ? '2px solid var(--primary)' : '1px solid var(--border)',
                }}
                onClick={() => setSelectedArea(area.name)}
              >
                <div class="card-header" style={{ 'margin-bottom': '8px', 'padding-bottom': '6px' }}>
                  <h3 class="card-title" style={{ 'font-size': '15px' }}>
                    📍 {area.name}
                  </h3>
                </div>
                <div class="prop-list">
                  <div class="prop-item" style={{ padding: '4px 0' }}>
                    <span class="prop-label">Orders</span>
                    <span class="prop-value">{area.total_orders}</span>
                  </div>
                  <div class="prop-item" style={{ padding: '4px 0' }}>
                    <span class="prop-label">Items</span>
                    <span class="prop-value">{area.total_items}</span>
                  </div>
                  <div class="prop-item" style={{ padding: '4px 0' }}>
                    <span class="prop-label">Customers</span>
                    <span class="prop-value">{area.unique_customers}</span>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Full Area Breakdown Table */}
        <section class="card" style={{ 'margin-bottom': '24px' }}>
          <div class="card-header">
            <h2 class="card-title">All Regional Areas ({areasData()?.areas?.length || 0})</h2>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Area Name</th>
                  <th>Customers</th>
                  <th>Total Orders</th>
                  <th>Total Items</th>
                  <th style={{ 'min-width': '160px' }}>Status Breakdown</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!areasData.loading}
                  fallback={
                    <tr>
                      <td colspan="6" class="loading-box">
                        Loading regional areas...
                      </td>
                    </tr>
                  }
                >
                  <For each={areasData()?.areas}>
                    {(area) => (
                      <tr
                        style={{
                          'background-color': currentArea() === area.name ? 'rgba(67, 97, 238, 0.05)' : undefined,
                        }}
                      >
                        <td style={{ 'font-weight': '600' }}>
                          <button
                            type="button"
                            class="btn-link"
                            style={{ padding: '0', 'font-weight': '600' }}
                            onClick={() => setSelectedArea(area.name)}
                          >
                            📍 {area.name}
                          </button>
                        </td>
                        <td>{area.unique_customers}</td>
                        <td>{area.total_orders}</td>
                        <td>{area.total_items}</td>
                        <td>
                          <StatusBar statusCounts={area.status_counts} height={16} />
                        </td>
                        <td>
                          <A
                            href={`/orders?area=${encodeURIComponent(area.name)}`}
                            class="btn btn-secondary"
                            style={{ 'padding': '4px 10px', 'font-size': '12px' }}
                          >
                            View Orders
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

        {/* Selected Area Customers Sub-table */}
        <Show when={currentArea()}>
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">
                Top Customers in <strong>📍 {currentArea()}</strong>
              </h2>
              <A
                href={`/orders?area=${encodeURIComponent(currentArea())}`}
                class="order-link"
                style={{ 'font-size': '13px' }}
              >
                View All Area Orders &rarr;
              </A>
            </div>
            <div class="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Orders</th>
                    <th>Items</th>
                    <th>Status Breakdown</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={areaCustomers()?.customers && areaCustomers()!.customers.length > 0}
                    fallback={
                      <tr>
                        <td colspan="5" class="empty-box">
                          No customers found for {currentArea()}
                        </td>
                      </tr>
                    }
                  >
                    <For each={areaCustomers()?.customers}>
                      {(cust) => (
                        <tr>
                          <td style={{ 'font-weight': '500' }}>🏥 {cust.name}</td>
                          <td>{cust.total_orders}</td>
                          <td>{cust.total_items}</td>
                          <td style={{ 'min-width': '140px' }}>
                            <StatusBar statusCounts={cust.status_counts} height={14} />
                          </td>
                          <td>
                            <A
                              href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                              class="btn btn-secondary"
                              style={{ 'padding': '4px 10px', 'font-size': '12px' }}
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
