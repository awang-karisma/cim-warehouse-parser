import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { getOrders } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { Pagination } from '../components/Pagination';

export const Orders: Component = () => {
  const [customer, setCustomer] = createSignal('');
  const [area, setArea] = createSignal('');
  const [tanggal, setTanggal] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [offset, setOffset] = createSignal(0);
  const limit = 20;

  // Active query state for triggering fetch
  const [queryParams, setQueryParams] = createSignal({
    customer: '',
    area: '',
    tanggal: '',
    status: '',
    limit,
    offset: 0,
  });

  const [data] = createResource(queryParams, (params) => getOrders(params));

  const applyFilters = (e?: Event) => {
    if (e) e.preventDefault();
    setOffset(0);
    setQueryParams({
      customer: customer(),
      area: area(),
      tanggal: tanggal(),
      status: status(),
      limit,
      offset: 0,
    });
  };

  const resetFilters = () => {
    setCustomer('');
    setArea('');
    setTanggal('');
    setStatus('');
    setOffset(0);
    setQueryParams({
      customer: '',
      area: '',
      tanggal: '',
      status: '',
      limit,
      offset: 0,
    });
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    setQueryParams((prev) => ({ ...prev, offset: newOffset }));
  };

  return (
    <div>
      <TopBar title="Orders Explorer">
        <Show when={data()?.total !== undefined}>
          <span class="badge badge-pill badge-primary">
            {data()?.total} Orders Total
          </span>
        </Show>
      </TopBar>

      <main class="content">
        {/* Filter Bar */}
        <section class="card" style={{ 'margin-bottom': '20px' }}>
          <form class="filter-bar" onSubmit={applyFilters}>
            <div class="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                class="form-control"
                placeholder="e.g. RSUD, Puskesmas"
                value={customer()}
                onInput={(e) => setCustomer(e.currentTarget.value)}
              />
            </div>

            <div class="form-group">
              <label>Area / Region</label>
              <input
                type="text"
                class="form-control"
                placeholder="e.g. Lombok Barat"
                value={area()}
                onInput={(e) => setArea(e.currentTarget.value)}
              />
            </div>

            <div class="form-group">
              <label>Order Date</label>
              <input
                type="text"
                class="form-control"
                placeholder="DD/MM/YYYY"
                value={tanggal()}
                onInput={(e) => setTanggal(e.currentTarget.value)}
              />
            </div>

            <div class="form-group">
              <label>Status</label>
              <select
                class="form-control"
                value={status()}
                onChange={(e) => setStatus(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" class="btn btn-primary">
                Apply Filters
              </button>
              <button type="button" class="btn btn-secondary" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </form>
        </section>

        {/* Orders Table */}
        <section class="card">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Order / E-Katalog No.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!data.loading}
                  fallback={
                    <tr>
                      <td colspan="8" class="loading-box">
                        Loading orders...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={data()?.orders && data()!.orders.length > 0}
                    fallback={
                      <tr>
                        <td colspan="8" class="empty-box">
                          No orders matching current filters
                        </td>
                      </tr>
                    }
                  >
                    <For each={data()?.orders}>
                      {(order) => {
                        const firstStatus = order.items?.[0]?.status_order || 'PENDING';
                        return (
                          <tr>
                            <td>
                              <A href={`/orders/${order.id}`} class="order-link">
                                {order.id}
                              </A>
                            </td>
                            <td>
                              <span style={{ 'font-family': 'monospace', 'font-size': '12px' }}>
                                {order.order_number || order.ecatalog_number || '-'}
                              </span>
                            </td>
                            <td>{order.tanggal}</td>
                            <td style={{ 'font-weight': '500' }}>{order.customer}</td>
                            <td>{order.area}</td>
                            <td>{order.total_items || order.items?.length || 0} items</td>
                            <td>
                              <Badge status={firstStatus} />
                            </td>
                            <td>
                              <A href={`/orders/${order.id}`} class="btn btn-secondary" style={{ 'padding': '4px 10px', 'font-size': '12px' }}>
                                View Detail
                              </A>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </tbody>
            </table>
          </div>

          <Show when={data() && data()!.total > 0}>
            <Pagination
              total={data()!.total}
              limit={limit}
              offset={offset()}
              onPageChange={handlePageChange}
            />
          </Show>
        </section>
      </main>
    </div>
  );
};
