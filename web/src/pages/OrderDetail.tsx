import { type Component, createResource, Show, For } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { getOrderById } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { MiniProgress } from '../components/MiniProgress';

export const OrderDetail: Component = () => {
  const params = useParams<{ id: string }>();
  const [order] = createResource(() => params.id, (id) => getOrderById(id));

  return (
    <div>
      <TopBar title={`Order Detail: ${params.id}`}>
        <A
          href="/orders"
          class="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 transition-colors"
        >
          &larr; Back to Orders
        </A>
      </TopBar>

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        <Show
          when={!order.loading}
          fallback={<div class="p-10 text-center text-muted text-sm">Loading order details...</div>}
        >
          <Show
            when={order()}
            fallback={
              <div class="bg-surface rounded-lg border border-border shadow-sm p-10 text-center">
                <h3 class="text-lg font-bold text-text mb-2">Order not found</h3>
                <p class="text-sm text-muted mb-4">
                  No order exists with ID <code class="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{params.id}</code>
                </p>
                <A
                  href="/orders"
                  class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
                >
                  Back to Orders List
                </A>
              </div>
            }
          >
            {/* Header / Metadata Card */}
            <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
              <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
                <div>
                  <h2 class="text-lg font-bold text-text">
                    {order()!.customer}
                  </h2>
                  <span class="text-xs text-muted">
                    {order()!.area || 'No area specified'}
                  </span>
                </div>
                <Badge status={order()!.items?.[0]?.status_order || 'PENDING'} pill />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="p-3 bg-gray-50 rounded-md border border-border">
                  <div class="text-xs text-muted font-medium mb-1">Order ID</div>
                  <div class="text-sm font-semibold text-text">{order()!.id}</div>
                </div>
                <div class="p-3 bg-gray-50 rounded-md border border-border">
                  <div class="text-xs text-muted font-medium mb-1">E-Katalog / Order Number</div>
                  <div class="text-sm font-semibold font-mono text-text">
                    {order()!.order_number || order()!.ecatalog_number || 'N/A'}
                  </div>
                </div>
                <div class="p-3 bg-gray-50 rounded-md border border-border">
                  <div class="text-xs text-muted font-medium mb-1">Order Date</div>
                  <div class="text-sm font-semibold text-text">{order()!.tanggal}</div>
                </div>
                <div class="p-3 bg-gray-50 rounded-md border border-border">
                  <div class="text-xs text-muted font-medium mb-1">Total Line Items</div>
                  <div class="text-sm font-semibold text-text">
                    {order()!.total_items || order()!.items?.length || 0} items
                  </div>
                </div>
              </div>
            </section>

            {/* Line Items Table Card */}
            <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
              <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
                <h2 class="text-base font-semibold text-text">Order Line Items ({order()!.items?.length || 0})</h2>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                      <th class="py-2.5 px-3">#</th>
                      <th class="py-2.5 px-3">Item Name</th>
                      <th class="py-2.5 px-3">Quantity</th>
                      <th class="py-2.5 px-3">Delivery Date</th>
                      <th class="py-2.5 px-3">Progress</th>
                      <th class="py-2.5 px-3">Sent / Remaining</th>
                      <th class="py-2.5 px-3">Status Order</th>
                      <th class="py-2.5 px-3">Status Barang</th>
                      <th class="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={order()!.items}>
                      {(item, idx) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 text-muted">{item.row_index || idx() + 1}</td>
                          <td class="py-2.5 px-3 font-semibold text-text">{item.nama_barang}</td>
                          <td class="py-2.5 px-3 text-text">
                            {item.jumlah} {item.satuan}
                          </td>
                          <td class="py-2.5 px-3 text-text">
                            {item.tanggal_pengiriman ? (
                              <span>
                                {item.tanggal_pengiriman}
                                {item.lead_time_pengiriman ? (
                                  <span class="text-muted text-xs">
                                    {' '}
                                    ({item.lead_time_pengiriman}d lead)
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span class="text-muted">-</span>
                            )}
                          </td>
                          <td class="py-2.5 px-3 min-w-[120px]">
                            <MiniProgress
                              terkirim={item.jumlah_terkirim}
                              total={item.jumlah}
                            />
                          </td>
                          <td class="py-2.5 px-3 text-xs text-text">
                            {item.jumlah_terkirim || '0'} / {item.belum_terkirim || '0'}
                          </td>
                          <td class="py-2.5 px-3">
                            <Badge status={item.status_order} />
                          </td>
                          <td class="py-2.5 px-3">
                            <Badge status={item.status_barang} />
                          </td>
                          <td class="py-2.5 px-3 text-xs text-muted max-w-[200px] truncate">
                            {item.keterangan || item.catatan || '-'}
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
      </main>
    </div>
  );
};
