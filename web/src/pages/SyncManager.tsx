import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import {
  IconBolt,
  IconLoader2,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconSun,
  IconWorld,
  IconCalendar,
  IconRefresh,
} from '@tabler/icons-solidjs';
import { getStatus, getSyncHistory, getConfig, triggerSync, subscribeSyncEvents } from '../api';
import type { SyncEvent } from '../types';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';

export const SyncManager: Component = () => {
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const [history, { refetch: refetchHistory }] = createResource(() => getSyncHistory({ limit: 10 }));
  const [config] = createResource(getConfig);

  // Live SSE sync state
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [syncProgressMsg, setSyncProgressMsg] = createSignal<string>('');
  const [syncError, setSyncError] = createSignal<string>('');

  const handleManualSync = async () => {
    if (isSyncing()) return;

    setIsSyncing(true);
    setSyncProgressMsg('Connecting to sync worker...');
    setSyncError('');

    let es: EventSource | null = null;

    try {
      es = subscribeSyncEvents((evt: SyncEvent) => {
        if (evt.status === 'SYNCING') {
          setSyncProgressMsg(evt.message || 'Synchronizing with remote source...');
        } else if (evt.status === 'SUCCESS') {
          setSyncProgressMsg(
            `Sync successful! Updated ${evt.record?.items_count ?? 0} items in ${evt.duration_ms ?? 0}ms.`
          );
          setIsSyncing(false);
          if (es) es.close();
          refetchStatus();
          refetchHistory();
        } else if (evt.status === 'ERROR') {
          setSyncError(evt.error || 'Sync failed');
          setIsSyncing(false);
          if (es) es.close();
          refetchStatus();
          refetchHistory();
        }
      });

      // Trigger the POST sync endpoint
      await triggerSync();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Trigger sync failed';
      setSyncError(message);
      setIsSyncing(false);
      if (es) es.close();
      refetchStatus();
      refetchHistory();
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
  };

  return (
    <div>
      <TopBar
        title="Sync Manager & Worker Diagnostics"
        statusText={
          isSyncing()
            ? 'Sync in progress...'
            : status()?.status === 'SYNCING'
            ? 'Worker Syncing'
            : 'Worker Idle'
        }
        statusType={
          isSyncing() || status()?.status === 'SYNCING'
            ? 'syncing'
            : status()?.status === 'ERROR'
            ? 'error'
            : 'success'
        }
      />

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        {/* Live Sync Status Hero Card */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex flex-wrap justify-between items-center gap-4 mb-4 pb-3 border-b border-border">
            <div>
              <h2 class="text-base font-semibold text-text">Live Worker State</h2>
              <span class="text-xs text-muted">
                Real-time synchronization engine with Google Sheets mirror
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Badge
                status={isSyncing() ? 'SYNCING' : status()?.status || 'IDLE'}
                pill
              />
              <button
                type="button"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                disabled={isSyncing()}
                onClick={handleManualSync}
              >
                <Show
                  when={isSyncing()}
                  fallback={
                    <>
                      <IconBolt size={18} stroke={1.8} aria-hidden="true" />
                      <span>Trigger Sync Now</span>
                    </>
                  }
                >
                  <IconLoader2 size={18} stroke={1.8} class="animate-spin" aria-hidden="true" />
                  <span>Syncing...</span>
                </Show>
              </button>
            </div>
          </div>

          <Show when={isSyncing() || syncProgressMsg() || syncError()}>
            <div
              class={`px-4 py-3 rounded-md mb-4 text-sm font-medium flex items-center gap-2.5 ${
                syncError()
                  ? 'bg-status-pending/10 border border-status-pending text-status-pending'
                  : 'bg-primary/10 border border-primary text-primary'
              }`}
            >
              <Show
                when={isSyncing()}
                fallback={
                  syncError() ? (
                    <IconCircleX size={18} stroke={1.8} aria-hidden="true" />
                  ) : (
                    <IconCircleCheck size={18} stroke={1.8} aria-hidden="true" />
                  )
                }
              >
                <IconLoader2 size={18} stroke={1.8} class="animate-spin" aria-hidden="true" />
              </Show>
              <span>{syncError() || syncProgressMsg()}</span>
            </div>
          </Show>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1">Last Sync Completed</div>
              <div class="text-sm font-semibold text-text">{formatDateTime(status()?.last_sync)}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1">Next Scheduled Sync</div>
              <div class="text-sm font-semibold text-text">{formatDateTime(status()?.next_sync)}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1">Last Sync Duration</div>
              <div class="text-sm font-semibold text-text">
                {status()?.last_duration_ms ? `${status()!.last_duration_ms} ms` : '< 1s'}
              </div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1">Working Hours Window</div>
              <div class="text-sm font-semibold text-text flex items-center gap-1.5">
                <span
                  class={`w-2.5 h-2.5 rounded-full inline-block ${
                    status()?.is_inside_work_hours ? 'bg-status-selesai' : 'bg-status-proses'
                  }`}
                />
                <span>
                  {status()?.is_inside_work_hours ? 'Inside Working Hours' : 'Outside Working Hours'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Worker Schedule Configuration Card */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
            <h2 class="text-base font-semibold text-text">Worker Configuration & Schedule</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
                <IconClock size={15} stroke={1.8} aria-hidden="true" />
                <span>Sync Interval</span>
              </div>
              <div class="text-sm font-semibold text-text">{config()?.sync_interval || '15m'}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
                <IconSun size={15} stroke={1.8} aria-hidden="true" />
                <span>Daily Work Hours</span>
              </div>
              <div class="text-sm font-semibold text-text">
                {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
              </div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
                <IconWorld size={15} stroke={1.8} aria-hidden="true" />
                <span>Timezone</span>
              </div>
              <div class="text-sm font-semibold text-text">{config()?.timezone || 'Asia/Makassar'}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border">
              <div class="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
                <IconCalendar size={15} stroke={1.8} aria-hidden="true" />
                <span>Active Work Days</span>
              </div>
              <div class="text-sm font-semibold text-text">
                {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
              </div>
            </div>
            <div class="p-3 bg-gray-50 rounded-md border border-border sm:col-span-2">
              <div class="text-xs text-muted font-medium mb-1">Remote Google Spreadsheet ID</div>
              <div class="text-xs font-mono font-semibold text-text break-all">
                {config()?.spreadsheet_id || '-'}
              </div>
            </div>
          </div>
        </section>

        {/* Sync History Table & Duration Visualization */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
          <div class="flex justify-between items-center mb-4 pb-3 border-b border-border">
            <h2 class="text-base font-semibold text-text">Sync History Records</h2>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-text hover:bg-gray-200 cursor-pointer transition-colors"
              onClick={() => refetchHistory()}
            >
              <IconRefresh size={14} stroke={1.8} aria-hidden="true" />
              <span>Refresh History</span>
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3"># ID</th>
                  <th class="py-2.5 px-3">Sync Timestamp</th>
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Items Count</th>
                  <th class="py-2.5 px-3">Orders Count</th>
                  <th class="py-2.5 px-3">Duration</th>
                  <th class="py-2.5 px-3">Error Message</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!history.loading}
                  fallback={
                    <tr>
                      <td colspan="7" class="p-8 text-center text-muted text-sm">
                        Loading sync history...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={history()?.records && history()!.records.length > 0}
                    fallback={
                      <tr>
                        <td colspan="7" class="p-8 text-center text-muted text-sm">
                          No sync records in database
                        </td>
                      </tr>
                    }
                  >
                    <For each={history()?.records}>
                      {(rec) => (
                        <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                          <td class="py-2.5 px-3 font-mono text-xs text-text">#{rec.id}</td>
                          <td class="py-2.5 px-3 text-text">{formatDateTime(rec.synced_at)}</td>
                          <td class="py-2.5 px-3">
                            <Badge status={rec.status} />
                          </td>
                          <td class="py-2.5 px-3 font-semibold text-text">{rec.items_count} items</td>
                          <td class="py-2.5 px-3 text-text">{rec.orders_count} orders</td>
                          <td class="py-2.5 px-3 text-text">{rec.duration_ms > 0 ? `${rec.duration_ms} ms` : '<1s'}</td>
                          <td class="py-2.5 px-3 text-xs text-status-pending max-w-[220px] truncate">
                            {rec.error_message || '-'}
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
