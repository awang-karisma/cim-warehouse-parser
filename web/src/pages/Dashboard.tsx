import { type Component, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconPackage,
  IconListDetails,
  IconUsers,
  IconMapPin,
} from '@tabler/icons-solidjs';
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

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* KPI Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <KpiCard
            title="TOTAL ORDERS"
            value={stats()?.total_orders ?? '...'}
            icon={IconPackage}
          />
          <KpiCard
            title="TOTAL LINE ITEMS"
            value={stats()?.total_items ?? '...'}
            icon={IconListDetails}
          />
          <KpiCard
            title="UNIQUE CUSTOMERS"
            value={stats()?.unique_customers ?? '...'}
            icon={IconUsers}
          />
          <KpiCard
            title="TOTAL AREAS"
            value={stats()?.unique_areas ?? '...'}
            icon={IconMapPin}
          />
        </div>

        {/* 2-Column Grid */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-stretch">
          {/* Status Distribution */}
          <section class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col h-full">
            <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
              <h2 class="text-base font-semibold text-text">Order Status Distribution</h2>
            </div>
            <StatusBar statusCounts={stats()?.status_counts} />
            <div class="mt-4 overflow-x-auto flex-1">
              <table class="w-full text-left border-collapse text-sm">
                <tbody>
                  <For each={Object.entries(stats()?.status_counts || {})}>
                    {([status, count]) => (
                      <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                        <td class="py-2.5 px-3">
                          <Badge status={status} />
                        </td>
                        <td class="py-2.5 px-3 font-semibold text-right text-text">{count}</td>
                        <td class="py-2.5 px-3 text-muted text-right">
                          {stats()?.total_items
                            ? `${Math.round((count / (stats()?.total_items || 1)) * 100)}%`
                            : '0%'}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent Sync History */}
          <section class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col h-full">
            <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
              <h2 class="text-base font-semibold text-text">Recent Sync Activity</h2>
              <A href="/sync" class="text-primary font-semibold text-xs hover:underline">
                View All &rarr;
              </A>
            </div>
            <div class="overflow-x-auto flex-1">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                    <th class="py-2.5 px-3">Time</th>
                    <th class="py-2.5 px-3">Status</th>
                    <th class="py-2.5 px-3">Items</th>
                    <th class="py-2.5 px-3">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={syncHistory()?.records && syncHistory()!.records.length > 0}
                    fallback={
                      <tr>
                        <td colspan="4" class="p-8 text-center text-muted text-sm">
                          No sync records yet
                        </td>
                      </tr>
                    }
                  >
                    <For each={syncHistory()?.records}>
                      {(rec) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 text-text">{formatSyncTime(rec.synced_at)}</td>
                          <td class="py-2.5 px-3">
                            <Badge status={rec.status} />
                          </td>
                          <td class="py-2.5 px-3 text-text">{rec.items_count} items</td>
                          <td class="py-2.5 px-3 text-text">{rec.duration_ms > 0 ? `${rec.duration_ms}ms` : '<1s'}</td>
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
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
            <h2 class="text-base font-semibold text-text">Recent Orders</h2>
            <A href="/orders" class="text-primary font-semibold text-xs hover:underline">
              View All Orders &rarr;
            </A>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Order ID</th>
                  <th class="py-2.5 px-3">Order Number / E-Katalog</th>
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Customer</th>
                  <th class="py-2.5 px-3">Area</th>
                  <th class="py-2.5 px-3">Items Count</th>
                  <th class="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={recentOrders()?.orders && recentOrders()!.orders.length > 0}
                  fallback={
                    <tr>
                      <td colspan="7" class="p-8 text-center text-muted text-sm">
                        No orders found
                      </td>
                    </tr>
                  }
                >
                  <For each={recentOrders()?.orders}>
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
