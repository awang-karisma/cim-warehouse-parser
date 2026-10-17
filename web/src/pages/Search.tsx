import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { search } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';

export const Search: Component = () => {
  const [queryInput, setQueryInput] = createSignal('');
  const [submittedQuery, setSubmittedQuery] = createSignal('');
  const [filterType, setFilterType] = createSignal<'all' | 'orders' | 'items' | 'customers'>('all');

  const [data] = createResource(
    () => (submittedQuery().trim() ? { q: submittedQuery().trim(), type: filterType() } : null),
    (params) => search(params)
  );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setSubmittedQuery(queryInput());
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
          part.toLowerCase() === q.toLowerCase() ? <mark>{part}</mark> : part
        )}
      </>
    );
  };

  return (
    <div>
      <TopBar title="Global Search" />

      <main class="content">
        {/* Search Hero Input */}
        <form onSubmit={handleSubmit} class="search-hero">
          <input
            type="text"
            placeholder="Search anything across orders, items, and customers (e.g. Yellowtip, RS Harapan)..."
            value={queryInput()}
            onInput={(e) => setQueryInput(e.currentTarget.value)}
            autofocus
          />
        </form>

        {/* Filter Chips */}
        <div class="chips-row">
          {(['all', 'orders', 'items', 'customers'] as const).map((type) => (
            <button
              type="button"
              class={`chip ${filterType() === type ? 'active' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              <Show when={data()}>
                {' '}
                (
                {type === 'all'
                  ? totalMatches()
                  : type === 'orders'
                  ? data()?.orders?.total || 0
                  : type === 'items'
                  ? data()?.items?.total || 0
                  : data()?.customers?.total || 0}
                )
              </Show>
            </button>
          ))}
        </div>

        {/* Results Area */}
        <Show when={submittedQuery().trim()}>
          <Show
            when={!data.loading}
            fallback={<div class="loading-box">Searching across warehouse database...</div>}
          >
            <div style={{ 'margin-bottom': '16px', color: 'var(--text-muted)', 'font-size': '13px' }}>
              Found <strong>{totalMatches()}</strong> total matches for "
              <strong>{submittedQuery()}</strong>"
            </div>

            {/* 1. Matched Orders */}
            <Show when={filterType() === 'all' || filterType() === 'orders'}>
              <Show when={data()?.orders?.results && data()!.orders.results.length > 0}>
                <section class="card" style={{ 'margin-bottom': '20px' }}>
                  <div class="card-header">
                    <h3 class="card-title">📦 Matched Orders ({data()!.orders.total})</h3>
                  </div>
                  <div class="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Matched Line Items</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={data()!.orders.results}>
                          {(ord) => (
                            <tr>
                              <td>
                                <A href={`/orders/${ord.id}`} class="order-link">
                                  {ord.id}
                                </A>
                              </td>
                              <td style={{ 'font-weight': '600' }}>
                                {highlightMatch(ord.customer, submittedQuery())}
                              </td>
                              <td>{ord.tanggal}</td>
                              <td>
                                <Show
                                  when={ord.matched_items && ord.matched_items.length > 0}
                                  fallback={<span style={{ color: 'var(--text-muted)' }}>-</span>}
                                >
                                  <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
                                    <For each={ord.matched_items}>
                                      {(item) => (
                                        <span class="badge badge-gray">
                                          {highlightMatch(item, submittedQuery())}
                                        </span>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </td>
                              <td>
                                <A
                                  href={`/orders/${ord.id}`}
                                  class="btn btn-secondary"
                                  style={{ 'padding': '4px 10px', 'font-size': '12px' }}
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
                <section class="card" style={{ 'margin-bottom': '20px' }}>
                  <div class="card-header">
                    <h3 class="card-title">📑 Matched Line Items ({data()!.items.total})</h3>
                  </div>
                  <div class="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Customer</th>
                          <th>Item Name</th>
                          <th>Qty</th>
                          <th>Status Order</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={data()!.items.results}>
                          {(item) => (
                            <tr>
                              <td>{item.row_index}</td>
                              <td style={{ 'font-weight': '500' }}>
                                {highlightMatch(item.customer, submittedQuery())}
                              </td>
                              <td style={{ 'font-weight': '600' }}>
                                {highlightMatch(item.nama_barang, submittedQuery())}
                              </td>
                              <td>{item.jumlah}</td>
                              <td>
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
                <section class="card">
                  <div class="card-header">
                    <h3 class="card-title">🏥 Matched Customers ({data()!.customers.total})</h3>
                  </div>
                  <div class="grid-3" style={{ 'margin-bottom': '0' }}>
                    <For each={data()!.customers.results}>
                      {(cust) => (
                        <div
                          class="card"
                          style={{
                            'margin-bottom': '0',
                            border: '1px solid var(--border)',
                            padding: '16px',
                          }}
                        >
                          <h4 style={{ 'font-size': '15px', 'margin-bottom': '4px' }}>
                            🏥 {highlightMatch(cust.name, submittedQuery())}
                          </h4>
                          <span style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>
                            📍 {cust.area || 'Unknown Area'}
                          </span>
                          <div style={{ 'margin-top': '12px' }}>
                            <span class="badge badge-gray">{cust.total_orders} Orders</span>
                          </div>
                          <A
                            href={`/orders?customer=${encodeURIComponent(cust.name)}`}
                            class="btn btn-secondary"
                            style={{ width: '100%', 'margin-top': '12px', 'font-size': '12px' }}
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
              <div class="card empty-box">
                <h3>No results found</h3>
                <p style={{ 'margin-top': '8px' }}>
                  No orders, items, or customers matched "<strong>{submittedQuery()}</strong>".
                </p>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
};
