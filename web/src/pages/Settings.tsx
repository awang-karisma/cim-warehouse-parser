import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { getSystemInfo, getConfig, getStatus, triggerSync } from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';

export const Settings: Component = () => {
  const [system] = createResource(getSystemInfo);
  const [config] = createResource(getConfig);
  const [status, { refetch: refetchStatus }] = createResource(getStatus);

  const [resyncing, setResyncing] = createSignal(false);
  const [resyncMsg, setResyncMsg] = createSignal('');

  const handleForceResync = async () => {
    if (resyncing()) return;
    setResyncing(true);
    setResyncMsg('Triggering full resync...');
    try {
      const res = await triggerSync();
      setResyncMsg(`Resync finished: ${res.message || 'Success'}`);
      refetchStatus();
    } catch (err: unknown) {
      setResyncMsg(err instanceof Error ? err.message : 'Resync error');
    } finally {
      setResyncing(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div>
      <TopBar title="Settings & System Diagnostics">
        <Badge status="HEALTHY" pill />
      </TopBar>

      <main class="content">
        <div class="grid-2">
          {/* Server Runtime Info */}
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">🖥️ Server Runtime Information</h2>
            </div>
            <div class="prop-list">
              <div class="prop-item">
                <span class="prop-label">Application Version</span>
                <span class="prop-value">{system()?.version || 'v1.0.0'}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Go Runtime Version</span>
                <span class="prop-value">{system()?.go_version || '-'}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">HTTP Server Port</span>
                <span class="prop-value">:{system()?.port || '8080'}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">SQLite Database Path</span>
                <span class="prop-value" style={{ 'font-family': 'monospace', 'font-size': '12px' }}>
                  {system()?.db_path || 'data/warehouse.db'}
                </span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Server Uptime</span>
                <span class="prop-value">{formatUptime(system()?.uptime_seconds)}</span>
              </div>
            </div>
          </section>

          {/* Sync Configuration */}
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">⚙️ Data Source & Scheduling</h2>
            </div>
            <div class="prop-list">
              <div class="prop-item">
                <span class="prop-label">Sync Interval</span>
                <span class="prop-value">{config()?.sync_interval || '15m'}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Working Hours Window</span>
                <span class="prop-value">
                  {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
                </span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Timezone</span>
                <span class="prop-value">{config()?.timezone || 'Asia/Makassar'}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Active Work Days</span>
                <span class="prop-value">
                  {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
                </span>
              </div>
              <div class="prop-item">
                <span class="prop-label">Worker Status</span>
                <span class="prop-value">
                  <Badge status={status()?.status || 'IDLE'} />
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Database Table Diagnostics Table */}
        <section class="card" style={{ 'margin-bottom': '24px' }}>
          <div class="card-header">
            <h2 class="card-title">💾 SQLite Database Tables Diagnostics</h2>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Table Name</th>
                  <th>Row Count</th>
                  <th>Storage Engine</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={system()?.tables}
                  fallback={
                    <tr>
                      <td colspan="4" class="loading-box">
                        Loading database table stats...
                      </td>
                    </tr>
                  }
                >
                  <For each={Object.entries(system()!.tables)}>
                    {([tableName, stat]) => (
                      <tr>
                        <td style={{ 'font-weight': '600', 'font-family': 'monospace' }}>
                          {tableName}
                        </td>
                        <td style={{ 'font-weight': '600' }}>{stat.row_count} rows</td>
                        <td>SQLite 3 (WAL mode)</td>
                        <td>
                          <Badge status="READY" />
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </section>

        {/* Maintenance & Dangerous Operations */}
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">🛠️ Maintenance Operations</h2>
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                padding: '12px',
                background: '#f8f9fa',
                'border-radius': '6px',
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <h4 style={{ 'font-size': '14px', 'font-weight': '600' }}>
                  Force Full Data Resynchronization
                </h4>
                <p style={{ 'font-size': '12px', color: 'var(--text-muted)', 'margin-top': '4px' }}>
                  Bypasses working hours checks and executes an atomic mirror sync from the configured remote source.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-primary"
                disabled={resyncing()}
                onClick={handleForceResync}
              >
                {resyncing() ? 'Syncing...' : 'Force Resync'}
              </button>
            </div>

            <Show when={resyncMsg()}>
              <div
                style={{
                  padding: '8px 12px',
                  'border-radius': '6px',
                  background: 'rgba(67, 97, 238, 0.1)',
                  color: 'var(--primary)',
                  'font-size': '13px',
                }}
              >
                {resyncMsg()}
              </div>
            </Show>

            <div
              style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                padding: '12px',
                background: '#fff5f5',
                'border-radius': '6px',
                border: '1px solid rgba(230, 57, 70, 0.2)',
              }}
            >
              <div>
                <h4 style={{ 'font-size': '14px', 'font-weight': '600', color: 'var(--danger)' }}>
                  Clear Local Storage Database
                </h4>
                <p style={{ 'font-size': '12px', color: 'var(--text-muted)', 'margin-top': '4px' }}>
                  Destructive operation: removes all orders, items, and sync history. Disabled in production.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-danger"
                disabled
                title="Disabled for safety"
              >
                Clear Database
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
