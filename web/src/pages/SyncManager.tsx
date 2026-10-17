import { type Component, createSignal, createResource, Show, For } from 'solid-js';
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

      <main class="content">
        {/* Live Sync Status Hero Card */}
        <section class="card" style={{ 'margin-bottom': '24px' }}>
          <div class="card-header">
            <div>
              <h2 class="card-title">Live Worker State</h2>
              <span style={{ color: 'var(--text-muted)', 'font-size': '13px' }}>
                Real-time synchronization engine with Google Sheets mirror
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
              <Badge
                status={isSyncing() ? 'SYNCING' : status()?.status || 'IDLE'}
                pill
              />
              <button
                type="button"
                class="btn btn-primary"
                disabled={isSyncing()}
                onClick={handleManualSync}
              >
                {isSyncing() ? '🔄 Syncing...' : '⚡ Trigger Sync Now'}
              </button>
            </div>
          </div>

          <Show when={isSyncing() || syncProgressMsg() || syncError()}>
            <div
              style={{
                padding: '12px 16px',
                'border-radius': '6px',
                'margin-bottom': '16px',
                background: syncError() ? 'rgba(230, 57, 70, 0.1)' : 'rgba(67, 97, 238, 0.1)',
                border: syncError() ? '1px solid var(--danger)' : '1px solid var(--primary)',
                color: syncError() ? 'var(--danger)' : 'var(--primary)',
                'font-weight': '500',
                display: 'flex',
                'align-items': 'center',
                gap: '10px',
              }}
            >
              <span>{isSyncing() ? '⏳' : syncError() ? '❌' : '✅'}</span>
              <span>{syncError() || syncProgressMsg()}</span>
            </div>
          </Show>

          <div class="config-grid">
            <div class="config-item">
              <div class="config-label">Last Sync Completed</div>
              <div class="config-value">{formatDateTime(status()?.last_sync)}</div>
            </div>
            <div class="config-item">
              <div class="config-label">Next Scheduled Sync</div>
              <div class="config-value">{formatDateTime(status()?.next_sync)}</div>
            </div>
            <div class="config-item">
              <div class="config-label">Last Sync Duration</div>
              <div class="config-value">
                {status()?.last_duration_ms ? `${status()!.last_duration_ms} ms` : '< 1s'}
              </div>
            </div>
            <div class="config-item">
              <div class="config-label">Working Hours Window</div>
              <div class="config-value">
                {status()?.is_inside_work_hours ? '🟢 Inside Working Hours' : '🟡 Outside Working Hours'}
              </div>
            </div>
          </div>
        </section>

        {/* Worker Schedule Configuration Card */}
        <section class="card" style={{ 'margin-bottom': '24px' }}>
          <div class="card-header">
            <h2 class="card-title">Worker Configuration & Schedule</h2>
          </div>
          <div class="config-grid">
            <div class="config-item">
              <div class="config-label">Sync Interval</div>
              <div class="config-value">⏱️ {config()?.sync_interval || '15m'}</div>
            </div>
            <div class="config-item">
              <div class="config-label">Daily Work Hours</div>
              <div class="config-value">
                ☀️ {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
              </div>
            </div>
            <div class="config-item">
              <div class="config-label">Timezone</div>
              <div class="config-value">🌏 {config()?.timezone || 'Asia/Makassar'}</div>
            </div>
            <div class="config-item">
              <div class="config-label">Active Work Days</div>
              <div class="config-value">
                📅 {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
              </div>
            </div>
            <div class="config-item" style={{ 'grid-column': 'span 2' }}>
              <div class="config-label">Remote Google Spreadsheet ID</div>
              <div class="config-value" style={{ 'font-family': 'monospace', 'font-size': '12px' }}>
                {config()?.spreadsheet_id || '-'}
              </div>
            </div>
          </div>
        </section>

        {/* Sync History Table & Duration Visualization */}
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Sync History Records</h2>
            <button
              type="button"
              class="btn btn-secondary"
              style={{ 'font-size': '12px', padding: '4px 10px' }}
              onClick={() => refetchHistory()}
            >
              Refresh History
            </button>
          </div>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th># ID</th>
                  <th>Sync Timestamp</th>
                  <th>Status</th>
                  <th>Items Count</th>
                  <th>Orders Count</th>
                  <th>Duration</th>
                  <th>Error Message</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={!history.loading}
                  fallback={
                    <tr>
                      <td colspan="7" class="loading-box">
                        Loading sync history...
                      </td>
                    </tr>
                  }
                >
                  <Show
                    when={history()?.records && history()!.records.length > 0}
                    fallback={
                      <tr>
                        <td colspan="7" class="empty-box">
                          No sync records in database
                        </td>
                      </tr>
                    }
                  >
                    <For each={history()?.records}>
                      {(rec) => (
                        <tr>
                          <td style={{ 'font-family': 'monospace' }}>#{rec.id}</td>
                          <td>{formatDateTime(rec.synced_at)}</td>
                          <td>
                            <Badge status={rec.status} />
                          </td>
                          <td style={{ 'font-weight': '600' }}>{rec.items_count} items</td>
                          <td>{rec.orders_count} orders</td>
                          <td>{rec.duration_ms > 0 ? `${rec.duration_ms} ms` : '<1s'}</td>
                          <td style={{ 'font-size': '12px', color: 'var(--danger)', 'max-width': '220px' }}>
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
