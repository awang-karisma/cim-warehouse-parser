import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { getItems } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { MiniProgress } from '../components/MiniProgress';
import { KpiCard } from '../components/KpiCard';

export const Timeline: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [dateFilter, setDateFilter] = createSignal('');

  // Fetch items with limit 100 for timeline analysis
  const [itemsData] = createResource(
    () => ({ status_order: statusFilter(), date: dateFilter() }),
    (params) => getItems({ limit: 100, ...params })
  );

  const itemsWithDelivery = createMemo(() => {
    const list = itemsData()?.items || [];
    return list.filter((it) => it.tanggal_pengiriman && it.tanggal_pengiriman.trim() !== '');
  });

  const summary = createMemo(() => {
    const items = itemsWithDelivery();
    let completed = 0;
    let pending = 0;
    let totalLead = 0;
    let leadCount = 0;

    for (const it of items) {
      const belum = parseFloat(it.belum_terkirim) || 0;
      if (belum === 0 && it.status_order?.toUpperCase() === 'SELESAI') {
        completed++;
      } else {
        pending++;
      }

      const lt = parseFloat(it.lead_time_pengiriman);
      if (!isNaN(lt) && lt >= 0) {
        totalLead += lt;
        leadCount++;
      }
    }

    const avgLead = leadCount > 0 ? (totalLead / leadCount).toFixed(1) : '0';
    return {
      total: items.length,
      completed,
      pending,
      avgLead,
    };
  });

  return (
    <div>
      <TopBar title="Delivery Timeline & Lead Time Tracker" />

      <main class="content">
        {/* KPI Summary */}
        <div class="grid-4">
          <KpiCard
            title="DELIVERIES SCHEDULED"
            value={summary().total}
            icon="🚚"
          />
          <KpiCard
            title="COMPLETED DELIVERIES"
            value={summary().completed}
            icon="✅"
          />
          <KpiCard
            title="IN-TRANSIT / PENDING"
            value={summary().pending}
            icon="⏳"
          />
          <KpiCard
            title="AVG LEAD TIME"
            value={`${summary().avgLead} Days`}
            icon="⏱️"
          />
        </div>

        {/* Filter Bar */}
        <section class="card" style={{ 'margin-bottom': '20px' }}>
          <div class="filter-bar">
            <div class="form-group">
              <label>Delivery Status</label>
              <select
                class="form-control"
                value={statusFilter()}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>

            <div class="form-group">
              <label>Delivery Date</label>
              <input
                type="text"
                class="form-control"
                placeholder="DD/MM/YYYY"
                value={dateFilter()}
                onInput={(e) => setDateFilter(e.currentTarget.value)}
              />
            </div>

            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => {
                setStatusFilter('');
                setDateFilter('');
              }}
            >
              Reset Filters
            </button>
          </div>
        </section>

        {/* Deliveries Schedule Table */}
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Delivery Shipments & Schedule</h2>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Delivery Date</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Item Name</th>
                  <th>Order Qty</th>
                  <th>Lead Time</th>
                  <th>Delivery Progress</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!itemsData.loading}
                  fallback={
                    <tr>
                      <td colspan="9" class="loading-box">
                        Loading delivery schedule...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={itemsWithDelivery().length > 0}
                    fallback={
                      <tr>
                        <td colspan="9" class="empty-box">
                          No shipments with delivery dates recorded
                        </td>
                      </tr>
                    }
                  >
                    <For each={itemsWithDelivery()}>
                      {(item) => (
                        <tr>
                          <td style={{ 'font-weight': '600' }}>
                            📅 {item.tanggal_pengiriman}
                          </td>
                          <td style={{ 'font-weight': '500' }}>{item.customer}</td>
                          <td>{item.area}</td>
                          <td style={{ 'font-weight': '600' }}>{item.nama_barang}</td>
                          <td>
                            {item.jumlah} {item.satuan}
                          </td>
                          <td>
                            {item.lead_time_pengiriman ? (
                              <span class="badge badge-gray">{item.lead_time_pengiriman} Days</span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={{ 'min-width': '120px' }}>
                            <MiniProgress
                              terkirim={item.jumlah_terkirim}
                              total={item.jumlah}
                            />
                          </td>
                          <td>
                            <Show
                              when={parseFloat(item.belum_terkirim) > 0}
                              fallback={<span style={{ color: 'var(--success)' }}>Completed</span>}
                            >
                              <span style={{ color: 'var(--danger)', 'font-weight': '600' }}>
                                {item.belum_terkirim} {item.satuan}
                              </span>
                            </Show>
                          </td>
                          <td>
                            <Badge status={item.status_order} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </Show>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
