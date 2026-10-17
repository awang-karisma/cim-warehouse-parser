import { type Component, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { getStats, getOrders, getSyncHistory, getStatus } from '../api';
import { TopBar } from '../components/TopBar';
import { KpiCard } from '../components/KpiCard';
import { StatusBar } from '../components/StatusBar';
import { Badge } from '../components/Badge';

export const Dashboard: Component = () => {
  const [stats] = createResource(getStats);
  const [recentOrders] = createResource(() => getOrders({ limit: 5 }));
  const [syncHistory] = createResource(() => getSyncHistory({ limit: 5 }));
  const [workerStatus] = createResource(getStatus);

  const formatSyncTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' WITA';
  };

  return (
    <div>
      <TopBar
        title="Dashboard"
        statusText={
          workerStatus()?.status === 'SYNCING'
            ? 'Syncing...'
            : workerStatus()?.last_sync
            ? `Live Mirror Active • ${formatSyncTime(workerStatus()?.last_sync)}`
            : 'Ready'
        }
        statusType={
          workerStatus()?.status === 'SYNCING'
            ? 'syncing'
            : workerStatus()?.status === 'ERROR'
            ? 'error'
            : 'success'
        }
      />

      <main class="content">
        {/* KPI Cards */}
        <div class="grid-4">
          <KpiCard
            title="TOTAL ORDERS"
            value={stats()?.total_orders ?? '...'}
            icon="📦"
          />
          <KpiCard
            title="TOTAL LINE ITEMS"
            value={stats()?.total_items ?? '...'}
            icon="📑"
          />
          <KpiCard
            title="UNIQUE CUSTOMERS"
            value={stats()?.unique_customers ?? '...'}
            icon="🏥"
          />
          <KpiCard
            title="TOTAL AREAS"
            value={stats()?.unique_areas ?? '...'}
            icon="📍"
          />
        </div>

        {/* 2-Column Grid */}
        <div class="grid-2">
          {/* Status Distribution */}
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">Order Status Distribution</h2>
            </div>
            <StatusBar statusCounts={stats()?.status_counts} />
            <table class="legend-table">
              <tbody>
                <For each={Object.entries(stats()?.status_counts || {})}>
                  {([status, count]) => (
                    <tr>
                      <td>
                        <Badge status={status} />
                      </td>
                      <td style={{ 'font-weight': '600', 'text-align': 'right' }}>{count}</td>
                      <td style={{ color: 'var(--text-muted)', 'text-align': 'right' }}>
                        {stats()?.total_items
                          ? `${Math.round((count / (stats()?.total_items || 1)) * 100)}%`
                          : '0%'}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>

          {/* Recent Sync History */}
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">Recent Sync Activity</h2>
              <A href="/sync" class="order-link" style={{ 'font-size': '13px' }}>
                View All &rarr;
              </A>
            </div>
            <div class="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={syncHistory()?.records && syncHistory()!.records.length > 0}
                    fallback={
                      <tr>
                        <td colspan="4" class="empty-box">
                          No sync records yet
                        </td>
                      </tr>
                    }
                  >
                    <For each={syncHistory()?.records}>
                      {(rec) => (
                        <tr>
                          <td>{formatSyncTime(rec.synced_at)}</td>
                          <td>
                            <Badge status={rec.status} />
                          </td>
                          <td>{rec.items_count} items</td>
                          <td>{rec.duration_ms > 0 ? `${rec.duration_ms}ms` : '<1s'}</td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Recent Orders Table */}
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Recent Orders</h2>
            <A href="/orders" class="order-link" style={{ 'font-size': '13px' }}>
              View All Orders &rarr;
            </A>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Order Number / E-Katalog</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Items Count</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={recentOrders()?.orders && recentOrders()!.orders.length > 0}
                  fallback={
                    <tr>
                      <td colspan="7" class="empty-box">
                        No orders found
                      </td>
                    </tr>
                  }
                >
                  <For each={recentOrders()?.orders}>
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
                        </tr>
                      );
                    }}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
