import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import {
  IconTruckDelivery,
  IconCircleCheck,
  IconClockHour4,
  IconTimeline,
} from '@tabler/icons-solidjs';
import { getDeliveries } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';
import { MiniProgress } from '../components/MiniProgress';
import { KpiCard } from '../components/KpiCard';
import { createDebouncedSignal } from '../utils/debounce';
export const Timeline: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [dateFilter, debouncedDateFilter, setDateFilter, flushDateFilter] = createDebouncedSignal('', 300);

  // Fetch individual deliveries with limit 100 for timeline analysis
  const [deliveriesData] = createResource(
    () => ({ status_order: statusFilter(), date: debouncedDateFilter() }),
    (params) => getDeliveries({ limit: 100, ...params })
  );

  const deliveriesList = createMemo(() => deliveriesData()?.deliveries || []);

  const summary = createMemo(() => {
    const list = deliveriesList();
    let completed = 0;
    let pending = 0;
    let totalLead = 0;
    let leadCount = 0;

    for (const del of list) {
      const belum = parseFloat(del.item.belum_terkirim) || 0;
      if (belum === 0 && del.item.status_order?.toUpperCase() === 'SELESAI') {
        completed++;
      } else {
        pending++;
      }

      const lt = parseFloat(del.item.lead_time_pengiriman);
      if (!isNaN(lt) && lt >= 0) {
        totalLead += lt;
        leadCount++;
      }
    }

    const avgLead = leadCount > 0 ? (totalLead / leadCount).toFixed(1) : '0';
    return {
      total: list.length,
      completed,
      pending,
      avgLead,
    };
  });

  return (
    <div>
      <TopBar title="Delivery Timeline & Lead Time Tracker" />

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* KPI Summary */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 items-stretch">
          <KpiCard
            title="DELIVERIES SCHEDULED"
            value={summary().total}
            icon={IconTruckDelivery}
          />
          <KpiCard
            title="COMPLETED DELIVERIES"
            value={summary().completed}
            icon={IconCircleCheck}
          />
          <KpiCard
            title="IN-TRANSIT / PENDING"
            value={summary().pending}
            icon={IconClockHour4}
          />
          <KpiCard
            title="AVG LEAD TIME"
            value={`${summary().avgLead} Days`}
            icon={IconTimeline}
          />
        </div>

        {/* Filter Bar */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-5">
          <div class="flex flex-wrap items-end gap-4">
            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Delivery Status</label>
              <select
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={statusFilter()}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
              >
                <option value="">All Statuses</option>
                <option value="SELESAI">SELESAI</option>
                <option value="PROSES">PROSES</option>
                <option value="PENDING">PENDING</option>
                <option value="BATAL">BATAL</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-semibold text-muted">Delivery Date</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="DD/MM/YYYY"
                value={dateFilter()}
                onInput={(e) => setDateFilter(e.currentTarget.value)}
              />
            </div>

            <button
              type="button"
              class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-text hover:bg-gray-200 cursor-pointer transition-colors"
              onClick={() => {
                setStatusFilter('');
                flushDateFilter('');
              }}
            >
              Reset Filters
            </button>
          </div>
        </section>

        {/* Deliveries Schedule Table */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
          <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
            <h2 class="text-base font-semibold text-text">Delivery Shipments & Schedule</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Delivery Date</th>
                  <th class="py-2.5 px-3">Shipment Qty</th>
                  <th class="py-2.5 px-3">Customer</th>
                  <th class="py-2.5 px-3">Area</th>
                  <th class="py-2.5 px-3">Item Name</th>
                  <th class="py-2.5 px-3">Order Qty</th>
                  <th class="py-2.5 px-3">Lead Time</th>
                  <th class="py-2.5 px-3 min-w-[120px]">Delivery Progress</th>
                  <th class="py-2.5 px-3">Remaining</th>
                  <th class="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!deliveriesData.loading}
                  fallback={
                    <tr>
                      <td colspan="10" class="p-8 text-center text-muted text-sm">
                        Loading delivery schedule...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={deliveriesList().length > 0}
                    fallback={
                      <tr>
                        <td colspan="10" class="p-8 text-center text-muted text-sm">
                          No shipments with delivery dates recorded
                        </td>
                      </tr>
                    }
                  >
                    <For each={deliveriesList()}>
                      {(del) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 font-semibold text-text">
                            {del.delivery_date}
                          </td>
                          <td class="py-2.5 px-3 font-medium text-text">
                            {del.shipped_quantity ? `${del.shipped_quantity} ${del.item.satuan}` : '-'}
                          </td>
                          <td class="py-2.5 px-3 font-medium text-text">{del.item.customer}</td>
                          <td class="py-2.5 px-3 text-text">{del.item.area}</td>
                          <td class="py-2.5 px-3 font-semibold text-text">{del.item.nama_barang}</td>
                          <td class="py-2.5 px-3 text-text">
                            {del.item.jumlah} {del.item.satuan}
                          </td>
                          <td class="py-2.5 px-3">
                            <Show when={del.item.lead_time_pengiriman} fallback={<span>-</span>}>
                              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium">
                                {del.item.lead_time_pengiriman} Days
                              </span>
                            </Show>
                          </td>
                          <td class="py-2.5 px-3 min-w-[120px]">
                            <MiniProgress
                              terkirim={del.item.jumlah_terkirim}
                              total={del.item.jumlah}
                            />
                          </td>
                          <td class="py-2.5 px-3">
                            <Show
                              when={del.shipment_index === 0}
                              fallback={<span class="text-muted">-</span>}
                            >
                              <Show
                                when={parseFloat(del.item.belum_terkirim) > 0}
                                fallback={<span class="text-status-selesai font-medium">Completed</span>}
                              >
                                <span class="text-status-pending font-semibold">
                                  {del.item.belum_terkirim} {del.item.satuan}
                                </span>
                              </Show>
                            </Show>
                          </td>
                          <td class="py-2.5 px-3">
                            <Badge status={del.item.status_order} />
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
