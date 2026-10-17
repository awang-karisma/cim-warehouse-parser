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
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {data()?.total} Orders Total
          </span>
        </Show>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Filter Bar */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-5">
          <form class="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
            <div class="flex flex-col gap-1.5 min-w-[160px] flex-1">
              <label class="text-xs font-semibold text-muted">Customer Name</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. RSUD, Puskesmas"
                value={customer()}
                onInput={(e) => setCustomer(e.currentTarget.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5 min-w-[160px] flex-1">
              <label class="text-xs font-semibold text-muted">Area / Region</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Lombok Barat"
                value={area()}
                onInput={(e) => setArea(e.currentTarget.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Order Date</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="DD/MM/YYYY"
                value={tanggal()}
                onInput={(e) => setTanggal(e.currentTarget.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Status</label>
              <select
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={status()}
                onChange={(e) => setStatus(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
                <option value="BATAL">BATAL</option>
              </select>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="submit"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover cursor-pointer transition-colors"
              >
                Apply Filters
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-text hover:bg-gray-200 cursor-pointer transition-colors"
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        {/* Orders Table */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Order ID</th>
                  <th class="py-2.5 px-3">Order / E-Katalog No.</th>
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Customer</th>
                  <th class="py-2.5 px-3">Area</th>
                  <th class="py-2.5 px-3">Items</th>
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!data.loading}
                  fallback={
                    <tr>
                      <td colspan="8" class="p-8 text-center text-muted text-sm">
                        Loading orders...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={data()?.orders && data()!.orders.length > 0}
                    fallback={
                      <tr>
                        <td colspan="8" class="p-8 text-center text-muted text-sm">
                          No orders matching current filters
                        </td>
                      </tr>
                    }
                  >
                    <For each={data()?.orders}>
                      {(order) => {
                        const firstStatus = order.items?.[0]?.status_order || 'PENDING';
                        return (
                          <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                            <td class="py-2.5 px-3">
                              <A href={`/orders/${order.id}`} class="text-primary font-semibold hover:underline">
                                {order.id}
                              </A>
                            </td>
                            <td class="py-2.5 px-3 font-mono text-xs text-text">
                              {order.order_number || order.ecatalog_number || '-'}
                            </td>
                            <td class="py-2.5 px-3 text-text">{order.tanggal}</td>
                            <td class="py-2.5 px-3 font-medium text-text">{order.customer}</td>
                            <td class="py-2.5 px-3 text-text">{order.area}</td>
                            <td class="py-2.5 px-3 text-text">{order.total_items || order.items?.length || 0} items</td>
                            <td class="py-2.5 px-3">
                              <Badge status={firstStatus} />
                            </td>
                            <td class="py-2.5 px-3">
                              <A
                                href={`/orders/${order.id}`}
                                class="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
                              >
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
