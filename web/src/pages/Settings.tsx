import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import {
  IconDeviceDesktop,
  IconSettings as IconSettingsIcon,
  IconDatabase,
  IconTool,
  IconRefresh,
  IconUsers,
  IconTrash,
  IconPlus,
} from '@tabler/icons-solidjs';
import {
  getSystemInfo,
  getConfig,
  getStatus,
  triggerSync,
  getCustomerAliases,
  setCustomerAlias,
  deleteCustomerAlias,
} from '../api';
import { TopBar } from '../components/TopBar';
import { Badge } from '../components/Badge';

export const Settings: Component = () => {
  const [system] = createResource(getSystemInfo);
  const [config] = createResource(getConfig);
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const [aliasesData, { refetch: refetchAliases }] = createResource(getCustomerAliases);

  const [aliasInput, setAliasInput] = createSignal('');
  const [canonicalInput, setCanonicalInput] = createSignal('');
  const [areaInput, setAreaInput] = createSignal('');
  const [aliasError, setAliasError] = createSignal('');
  const [isAdding, setIsAdding] = createSignal(false);

  const handleAddAlias = async (e: Event) => {
    e.preventDefault();
    const a = aliasInput().trim();
    const c = canonicalInput().trim();
    if (!a || !c) {
      setAliasError('Both Variant Name (alias) and Canonical Name are required');
      return;
    }
    if (a.toLowerCase() === c.toLowerCase()) {
      setAliasError('Alias cannot be equal to canonical name');
      return;
    }
    setIsAdding(true);
    setAliasError('');
    try {
      await setCustomerAlias(a, c, areaInput().trim() || undefined);
      setAliasInput('');
      setCanonicalInput('');
      setAreaInput('');
      refetchAliases();
    } catch (err: unknown) {
      setAliasError(err instanceof Error ? err.message : 'Failed to add alias');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAlias = async (alias: string) => {
    setAliasError('');
    try {
      await deleteCustomerAlias(alias);
      refetchAliases();
    } catch (err: unknown) {
      setAliasError(err instanceof Error ? err.message : 'Failed to delete alias');
    }
  };
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

      <main class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-stretch">
          {/* Server Runtime Info */}
          <section class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col justify-between h-full">
            <div>
              <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <IconDeviceDesktop size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
                <h2 class="text-base font-semibold text-text">Server Runtime Information</h2>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Application Version</span>
                  <span class="font-semibold text-text">{system()?.version || 'v1.0.0'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Go Runtime Version</span>
                  <span class="font-semibold text-text">{system()?.go_version || '-'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">HTTP Server Port</span>
                  <span class="font-semibold text-text">:{system()?.port || '8080'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">SQLite Database Path</span>
                  <span class="font-mono text-xs font-semibold text-text">
                    {system()?.db_path || 'data/warehouse.db'}
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 text-sm">
                  <span class="text-xs text-muted">Server Uptime</span>
                  <span class="font-semibold text-text">{formatUptime(system()?.uptime_seconds)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Sync Configuration */}
          <section class="bg-surface rounded-lg border border-border shadow-sm p-5 flex flex-col justify-between h-full">
            <div>
              <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <IconSettingsIcon size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
                <h2 class="text-base font-semibold text-text">Data Source & Scheduling</h2>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Sync Interval</span>
                  <span class="font-semibold text-text">{config()?.sync_interval || '15m'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Working Hours Window</span>
                  <span class="font-semibold text-text">
                    {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Timezone</span>
                  <span class="font-semibold text-text">{config()?.timezone || 'Asia/Makassar'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-border text-sm">
                  <span class="text-xs text-muted">Active Work Days</span>
                  <span class="font-semibold text-text">
                    {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 text-sm">
                  <span class="text-xs text-muted">Worker Status</span>
                  <span>
                    <Badge status={status()?.status || 'IDLE'} />
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Database Table Diagnostics Table */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <IconDatabase size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
            <h2 class="text-base font-semibold text-text">SQLite Database Tables Diagnostics</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-gray-50 text-xs uppercase tracking-wider text-muted font-semibold">
                  <th class="py-2.5 px-3">Table Name</th>
                  <th class="py-2.5 px-3">Row Count</th>
                  <th class="py-2.5 px-3">Storage Engine</th>
                  <th class="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={system()?.tables}
                  fallback={
                    <tr>
                      <td colspan="4" class="p-8 text-center text-muted text-sm">
                        Loading database table stats...
                      </td>
                    </tr>
                  }
                >
                  <For each={Object.entries(system()!.tables)}>
                    {([tableName, stat]) => (
                      <tr class="hover:bg-gray-50 border-b border-border last:border-b-0">
                        <td class="py-2.5 px-3 font-semibold font-mono text-xs text-text">
                          {tableName}
                        </td>
                        <td class="py-2.5 px-3 font-semibold text-text">{stat.row_count} rows</td>
                        <td class="py-2.5 px-3 text-muted">SQLite 3 (WAL mode)</td>
                        <td class="py-2.5 px-3">
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

        {/* Customer Name Aliases Card */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5 mb-6">
          <div class="flex items-center gap-2 mb-2 pb-3 border-b border-border">
            <IconUsers size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
            <h2 class="text-base font-semibold text-text">Customer Name Aliases</h2>
          </div>
          <p class="text-xs text-muted mb-4">
            Aliases are applied during sync. Trigger a re-sync after changing aliases to update stored orders and items.
          </p>

          {/* Add Alias Form */}
          <form class="flex flex-wrap items-end gap-3 mb-5 p-4 bg-gray-50 rounded-lg border border-border" onSubmit={handleAddAlias}>
            <div class="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label class="text-xs font-semibold text-muted">Variant Name (alias)</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. PKU Muhammadiyah Hospital"
                value={aliasInput()}
                onInput={(e) => setAliasInput(e.currentTarget.value)}
              />
            </div>
            <div class="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label class="text-xs font-semibold text-muted">Canonical Name</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. RS PKU Muhammadiyah"
                value={canonicalInput()}
                onInput={(e) => setCanonicalInput(e.currentTarget.value)}
              />
            </div>
            <div class="flex flex-col gap-1 flex-1 min-w-[150px]">
              <label class="text-xs font-semibold text-muted">Linked Area (optional)</label>
              <input
                type="text"
                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Lombok Barat"
                value={areaInput()}
                onInput={(e) => setAreaInput(e.currentTarget.value)}
              />
            </div>
            <button
              type="submit"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer transition-colors"
              disabled={isAdding()}
            >
              <IconPlus size={16} stroke={1.8} aria-hidden="true" />
              <span>{isAdding() ? 'Adding...' : 'Add Mapping'}</span>
            </button>
          </form>

          <Show when={aliasError()}>
            <div class="px-3 py-2 rounded-md bg-status-pending/10 text-status-pending text-xs font-medium mb-4 border border-status-pending/20">
              {aliasError()}
            </div>
          </Show>

          {/* Grouped Aliases Display */}
          <div class="space-y-3">
            <Show
              when={aliasesData()?.groups && aliasesData()!.groups.length > 0}
              fallback={
                <div class="p-6 text-center text-muted text-sm border border-dashed border-border rounded-lg">
                  No customer aliases configured yet. Add your first variant mapping above.
                </div>
              }
            >
              <For each={aliasesData()?.groups}>
                {(grp) => (
                  <div class="p-3.5 bg-surface border border-border rounded-lg">
                    <div class="text-sm font-semibold text-text mb-2 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span>Canonical: <strong class="text-primary font-bold">{grp.canonical}</strong></span>
                        <Show when={grp.area}>
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium">
                            {grp.area}
                          </span>
                        </Show>
                      </div>
                      <span class="text-xs text-muted font-normal">{grp.aliases.length} alias{grp.aliases.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <For each={grp.aliases}>
                        {(al) => (
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-text border border-border">
                            <span>{al}</span>
                            <button
                              type="button"
                              class="text-muted hover:text-status-pending p-0.5 rounded cursor-pointer transition-colors"
                              title={`Delete alias ${al}`}
                              onClick={() => handleDeleteAlias(al)}
                            >
                              <IconTrash size={13} stroke={1.8} aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </section>

        {/* Maintenance Operations */}
        <section class="bg-surface rounded-lg border border-border shadow-sm p-5">
          <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <IconTool size={18} stroke={1.8} class="text-primary" aria-hidden="true" />
            <h2 class="text-base font-semibold text-text">Maintenance Operations</h2>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap justify-between items-center gap-4 p-4 bg-gray-50 rounded-lg border border-border">
              <div>
                <h4 class="text-sm font-semibold text-text">
                  Force Full Data Resynchronization
                </h4>
                <p class="text-xs text-muted mt-1">
                  Bypasses working hours checks and executes an atomic mirror sync from the configured remote source.
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer transition-colors"
                disabled={resyncing()}
                onClick={handleForceResync}
              >
                <IconRefresh size={16} stroke={1.8} class={resyncing() ? 'animate-spin' : ''} aria-hidden="true" />
                <span>{resyncing() ? 'Syncing...' : 'Force Resync'}</span>
              </button>
            </div>

            <Show when={resyncMsg()}>
              <div class="px-3 py-2 rounded-md bg-primary/10 text-primary text-xs font-medium">
                {resyncMsg()}
              </div>
            </Show>

            <div class="flex flex-wrap justify-between items-center gap-4 p-4 bg-red-50/50 rounded-lg border border-red-200">
              <div>
                <h4 class="text-sm font-semibold text-status-pending">
                  Clear Local Storage Database
                </h4>
                <p class="text-xs text-muted mt-1">
                  Destructive operation: removes all orders, items, and sync history. Disabled in production.
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-status-pending text-white opacity-50 cursor-not-allowed"
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
