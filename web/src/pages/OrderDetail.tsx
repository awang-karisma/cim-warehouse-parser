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
        <A href="/orders" class="btn btn-secondary" style={{ 'font-size': '12px', 'padding': '6px 12px' }}>
          &larr; Back to Orders
        </A>
      </TopBar>

      <main class="content">
        <Show
          when={!order.loading}
          fallback={<div class="loading-box">Loading order details...</div>}
        >
          <Show
            when={order()}
            fallback={
              <div class="card empty-box">
                <h3>Order not found</h3>
                <p style={{ 'margin-top': '8px' }}>
                  No order exists with ID <code>{params.id}</code>
                </p>
                <A href="/orders" class="btn btn-primary" style={{ 'margin-top': '16px' }}>
                  Back to Orders List
                </A>
              </div>
            }
          >
            {/* Header / Metadata Card */}
            <section class="card" style={{ 'margin-bottom': '24px' }}>
              <div class="card-header">
                <div>
                  <h2 class="card-title" style={{ 'font-size': '18px' }}>
                    {order()!.customer}
                  </h2>
                  <span style={{ color: 'var(--text-muted)', 'font-size': '13px' }}>
                    📍 {order()!.area || 'No area specified'}
                  </span>
                </div>
                <Badge status={order()!.items?.[0]?.status_order || 'PENDING'} pill />
              </div>

              <div class="config-grid">
                <div class="config-item">
                  <div class="config-label">Order ID</div>
                  <div class="config-value">{order()!.id}</div>
                </div>
                <div class="config-item">
                  <div class="config-label">E-Katalog / Order Number</div>
                  <div class="config-value" style={{ 'font-family': 'monospace' }}>
                    {order()!.order_number || order()!.ecatalog_number || 'N/A'}
                  </div>
                </div>
                <div class="config-item">
                  <div class="config-label">Order Date</div>
                  <div class="config-value">{order()!.tanggal}</div>
                </div>
                <div class="config-item">
                  <div class="config-label">Total Line Items</div>
                  <div class="config-value">
                    {order()!.total_items || order()!.items?.length || 0} items
                  </div>
                </div>
              </div>
            </section>

            {/* Line Items Table Card */}
            <section class="card">
              <div class="card-header">
                <h2 class="card-title">Order Line Items ({order()!.items?.length || 0})</h2>
              </div>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Quantity</th>
                      <th>Delivery Date</th>
                      <th>Progress</th>
                      <th>Sent / Remaining</th>
                      <th>Status Order</th>
                      <th>Status Barang</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={order()!.items}>
                      {(item, idx) => (
                        <tr>
                          <td>{item.row_index || idx() + 1}</td>
                          <td style={{ 'font-weight': '600' }}>{item.nama_barang}</td>
                          <td>
                            {item.jumlah} {item.satuan}
                          </td>
                          <td>
                            {item.tanggal_pengiriman ? (
                              <span>
                                {item.tanggal_pengiriman}
                                {item.lead_time_pengiriman ? (
                                  <span style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>
                                    {' '}
                                    ({item.lead_time_pengiriman}d lead)
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ 'min-width': '120px' }}>
                            <MiniProgress
                              terkirim={item.jumlah_terkirim}
                              total={item.jumlah}
                            />
                          </td>
                          <td style={{ 'font-size': '13px' }}>
                            {item.jumlah_terkirim || '0'} / {item.belum_terkirim || '0'}
                          </td>
                          <td>
                            <Badge status={item.status_order} />
                          </td>
                          <td>
                            <Badge status={item.status_barang} />
                          </td>
                          <td style={{ 'font-size': '12px', 'max-width': '200px' }}>
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
