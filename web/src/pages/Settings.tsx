import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import {
  IconDeviceDesktop,
  IconSettings as IconSettingsIcon,
  IconDatabase,
  IconTool,
  IconRefresh,
  IconTrash,
  IconSun,
  IconMoon,
} from '@tabler/icons-solidjs';
import { useColorMode } from '@kobalte/core';
import { useAuth } from '~/auth';
import {
  getSystemInfo,
  getConfig,
  getStatus,
  triggerSync,
  clearDatabase,
} from '../api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import { Badge } from '../components/Badge';
import { TableSkeleton } from '~/components/TableSkeleton';

export const Settings: Component = () => {
  const { colorMode, setColorMode } = useColorMode();
  const [system] = createResource(getSystemInfo);
  const [config] = createResource(getConfig);
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const auth = useAuth();
  const isAdmin = () => {
    const role = auth.user()?.role;
    return role === 'admin' || role === 'superadmin';
  };
  const [showClearDbDialog, setShowClearDbDialog] = createSignal(false);
  const [isClearingDb, setIsClearingDb] = createSignal(false);
  const [clearDbMsg, setClearDbMsg] = createSignal<string | null>(null);
  const [clearDbError, setClearDbError] = createSignal<string | null>(null);


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
    <div class="flex flex-1 flex-col gap-6">
      {/* Appearance Theme Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">Theme & Appearance</CardTitle>
            <CardDescription>Select light, dark, or system mode</CardDescription>
          </div>
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              variant={colorMode() === 'light' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('light')}
            >
              <IconSun class="size-3.5" />
              <span>Light</span>
            </Button>
            <Button
              variant={colorMode() === 'dark' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('dark')}
            >
              <IconMoon class="size-3.5" />
              <span>Dark</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('system')}
            >
              <IconDeviceDesktop class="size-3.5" />
              <span>System</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* 2-Column: Server Runtime + Sync Config */}
      <div class="grid gap-6 lg:grid-cols-2 items-stretch">
        {/* Server Runtime Info Card */}
        <Card class="flex flex-col justify-between">
          <div>
            <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
              <IconDeviceDesktop class="size-5 text-primary" />
              <div>
                <CardTitle class="text-base font-semibold">Server Runtime Information</CardTitle>
                <CardDescription>Internal backend environment</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Application Version</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span class="font-semibold">{system()?.version || 'v1.0.0'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Go Runtime Version</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-24" />}>
                  <span class="font-semibold">{system()?.go_version || '-'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">HTTP Server Port</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-16" />}>
                  <span class="font-semibold">:{system()?.port || '8080'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">SQLite Database Path</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-32" />}>
                  <span class="font-mono text-xs font-semibold">
                    {system()?.db_path || 'data/warehouse.db'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Server Uptime</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span class="font-semibold">{formatUptime(system()?.uptime_seconds)}</span>
                </Show>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Sync Configuration Card */}
        <Card class="flex flex-col justify-between">
          <div>
            <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
              <IconSettingsIcon class="size-5 text-primary" />
              <div>
                <CardTitle class="text-base font-semibold">Data Source & Scheduling</CardTitle>
                <CardDescription>Synchronization parameters and rules</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Sync Interval</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-16" />}>
                  <span class="font-semibold">{config()?.sync_interval || '15m'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Working Hours Window</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-28" />}>
                  <span class="font-semibold">
                    {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Timezone</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-28" />}>
                  <span class="font-semibold">{config()?.timezone || 'Asia/Makassar'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Active Work Days</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-32" />}>
                  <span class="font-semibold">
                    {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">Worker Status</span>
                <Show when={!status.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span>
                    <Badge status={status()?.status || 'IDLE'} />
                  </span>
                </Show>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Database Diagnostics Table Card */}
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconDatabase class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">SQLite Database Tables Diagnostics</CardTitle>
            <CardDescription>Internal tables and record volume</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Table Name</TableHead>
                  <TableHead class="text-right">Row Count</TableHead>
                  <TableHead>Storage Engine</TableHead>
                  <TableHead class="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={system()?.tables}
                  fallback={<TableSkeleton columns={4} rows={4} />}
                >
                  <For each={Object.entries(system()!.tables)}>
                    {([tableName, stat]) => (
                      <TableRow>
                        <TableCell class="font-mono text-xs font-semibold">{tableName}</TableCell>
                        <TableCell class="text-right font-medium">{stat.row_count.toLocaleString()} rows</TableCell>
                        <TableCell class="text-xs text-muted-foreground">SQLite 3 (WAL mode)</TableCell>
                        <TableCell class="text-right">
                          <Badge status="READY" />
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </Show>
              </TableBody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Maintenance Operations Card */}
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconTool class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">Maintenance Operations</CardTitle>
            <CardDescription>Manual controls and database utilities</CardDescription>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border bg-muted/20">
            <div>
              <h4 class="text-sm font-semibold">Force Full Data Resynchronization</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Bypasses working hours checks and executes an atomic mirror sync from the configured remote source.
              </p>
            </div>
            <Button
              size="sm"
              class="gap-1.5"
              disabled={resyncing()}
              onClick={handleForceResync}
            >
              <IconRefresh class={`size-4 ${resyncing() ? 'animate-spin' : ''}`} />
              <span>{resyncing() ? 'Syncing...' : 'Force Resync'}</span>
            </Button>
          </div>

          <Show when={resyncMsg()}>
            <div class="p-3 rounded-md bg-muted text-xs font-medium">
              {resyncMsg()}
            </div>
          </Show>

          <Show when={isAdmin()}>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
              <div>
                <h4 class="text-sm font-semibold text-destructive">Clear Local Storage Database</h4>
                <p class="text-xs text-muted-foreground mt-1">
                  Destructive operation: removes all orders, items, and sync history. Customer aliases and users are preserved.
                </p>
                <Show when={clearDbMsg()}>
                  <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2">
                    {clearDbMsg()}
                  </p>
                </Show>
                <Show when={clearDbError()}>
                  <p class="text-xs font-medium text-destructive mt-2">
                    {clearDbError()}
                  </p>
                </Show>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={isClearingDb()}
                onClick={() => setShowClearDbDialog(true)}
              >
                Clear Database
              </Button>
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* Clear Database Alert Dialog */}
      <AlertDialog
        open={showClearDbDialog()}
        onOpenChange={(open) => {
          if (!open) setShowClearDbDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Clear Local Database</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to clear all synced orders, items, deliveries, and sync history?
            This action cannot be undone. Customer aliases and users will be preserved.
          </AlertDialogDescription>
          <div class="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowClearDbDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isClearingDb()}
              onClick={async () => {
                setIsClearingDb(true);
                setClearDbMsg(null);
                setClearDbError(null);
                try {
                  await clearDatabase();
                  setClearDbMsg('Database cleared successfully.');
                  setShowClearDbDialog(false);
                  refetchStatus();
                } catch (err: unknown) {
                  setClearDbError(err instanceof Error ? err.message : 'Failed to clear database');
                } finally {
                  setIsClearingDb(false);
                }
              }}
            >
              {isClearingDb() ? 'Clearing...' : 'Clear All Data'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
