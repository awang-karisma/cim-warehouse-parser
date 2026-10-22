import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { useAuth } from '~/auth';
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card';
import {
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { DataTable } from '~/components/DataTable';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { TableSkeleton } from '~/components/TableSkeleton';
import { Badge } from '../components/Badge';

export const SyncManager: Component = () => {
  const [status, { refetch: refetchStatus }] = createResource(getStatus);
  const [history, { refetch: refetchHistory }] = createResource(() => getSyncHistory({ limit: 10 }));
  const [config] = createResource(getConfig);

  // Live SSE sync state
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [syncProgressMsg, setSyncProgressMsg] = createSignal<string>('');
  const [syncError, setSyncError] = createSignal<string>('');
  const auth = useAuth();
  const canSync = () => {
    const role = auth.user()?.role;
    return role === 'admin' || role === 'superadmin';
  };

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
    <div class="flex flex-1 flex-col gap-6">
      {/* Live Worker State Hero Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
          <div>
            <div class="flex items-center gap-2">
              <CardTitle class="text-base font-semibold">Live Worker State</CardTitle>
              <Badge
                status={isSyncing() ? 'SYNCING' : status()?.status || 'IDLE'}
                kind="sync"
                pill
              />
            </div>
            <CardDescription class="mt-1">
              Real-time synchronization engine connected to remote Google Sheets mirror
            </CardDescription>
          </div>
          <Show when={canSync()}>
            <Button
              size="sm"
              disabled={isSyncing()}
              onClick={handleManualSync}
              class="gap-2 self-start sm:self-auto"
            >
              <Show
                when={isSyncing()}
                fallback={
                  <>
                    <IconBolt class="size-4" />
                    <span>Trigger Sync Now</span>
                  </>
                }
              >
                <IconLoader2 class="size-4 animate-spin" />
                <span>Syncing...</span>
              </Show>
            </Button>
          </Show>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={isSyncing() || syncProgressMsg() || syncError()}>
            <Alert variant={syncError() ? 'destructive' : 'default'} class="border">
              <Show
                when={isSyncing()}
                fallback={
                  syncError() ? (
                    <IconCircleX class="size-4 text-destructive" />
                  ) : (
                    <IconCircleCheck class="size-4 text-status-selesai" />
                  )
                }
              >
                <IconLoader2 class="size-4 animate-spin text-primary" />
              </Show>
              <AlertTitle>
                {isSyncing() ? 'Sync Operation Active' : syncError() ? 'Sync Failed' : 'Sync Complete'}
              </AlertTitle>
              <AlertDescription>{syncError() || syncProgressMsg()}</AlertDescription>
            </Alert>
          </Show>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg border bg-muted/30 p-3.5 space-y-1">
              <div class="text-xs font-medium text-muted-foreground">Last Sync Completed</div>
              <div class="text-sm font-semibold text-foreground">
                {status.loading ? <Skeleton class="h-5 w-24" /> : formatDateTime(status()?.last_sync)}
              </div>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3.5 space-y-1">
              <div class="text-xs font-medium text-muted-foreground">Next Scheduled Sync</div>
              <div class="text-sm font-semibold text-foreground">
                {status.loading ? <Skeleton class="h-5 w-24" /> : formatDateTime(status()?.next_sync)}
              </div>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3.5 space-y-1">
              <div class="text-xs font-medium text-muted-foreground">Last Sync Duration</div>
              <div class="text-sm font-semibold font-mono text-foreground">
                {status.loading ? (
                  <Skeleton class="h-5 w-16" />
                ) : status()?.last_duration_ms ? (
                  `${status()!.last_duration_ms} ms`
                ) : (
                  '< 1s'
                )}
              </div>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3.5 space-y-1">
              <div class="text-xs font-medium text-muted-foreground">Working Hours Window</div>
              <div class="text-sm font-semibold text-foreground flex items-center gap-2">
                <span
                  class={`size-2 rounded-full inline-block ${
                    status()?.is_inside_work_hours ? 'bg-status-selesai' : 'bg-status-proses'
                  }`}
                />
                <span>
                  {status()?.is_inside_work_hours ? 'Inside Window' : 'Outside Window'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Worker Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle class="text-base font-semibold">Worker Configuration & Schedule</CardTitle>
          <CardDescription>Automated polling frequency and environment settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div class="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <IconClock class="size-4 text-primary" />
                <span>Sync Interval</span>
              </div>
              <div class="text-sm font-semibold">{config()?.sync_interval || '15m'}</div>
            </div>

            <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div class="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <IconSun class="size-4 text-primary" />
                <span>Daily Work Hours</span>
              </div>
              <div class="text-sm font-semibold">
                {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
              </div>
            </div>

            <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div class="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <IconWorld class="size-4 text-primary" />
                <span>Timezone</span>
              </div>
              <div class="text-sm font-semibold">{config()?.timezone || 'Asia/Makassar'}</div>
            </div>

            <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div class="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <IconCalendar class="size-4 text-primary" />
                <span>Active Work Days</span>
              </div>
              <div class="text-sm font-semibold">
                {config()?.work_days ? config()!.work_days.join(', ') : 'Monday – Saturday'}
              </div>
            </div>

            <div class="rounded-lg border bg-muted/20 p-3.5 space-y-1 sm:col-span-2">
              <div class="text-xs text-muted-foreground font-medium">Remote Google Spreadsheet ID</div>
              <div class="text-xs font-mono font-semibold text-foreground break-all">
                {config()?.spreadsheet_id || '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync History Table Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
          <div>
            <CardTitle class="text-base font-semibold">Sync History Records</CardTitle>
            <CardDescription>Audit log of past synchronization runs</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchHistory()}
            class="gap-1.5 text-xs h-8 self-start sm:self-auto"
          >
            <IconRefresh class="size-3.5" />
            <span>Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-16">ID</TableHead>
                  <TableHead>Sync Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead class="text-right">Items</TableHead>
                  <TableHead class="text-right">Orders</TableHead>
                  <TableHead class="text-right">Duration</TableHead>
                  <TableHead>Error Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!history.loading}
                  fallback={
                    <TableSkeleton columns={7} rows={3} />
                  }
                >
                  <Show
                    when={history()?.records && history()!.records.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={7} class="h-20 text-center text-muted-foreground">
                          No sync records in database
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={history()?.records}>
                      {(rec) => (
                        <TableRow>
                          <TableCell class="font-mono text-xs text-muted-foreground">
                            #{rec.id}
                          </TableCell>
                          <TableCell class="text-xs text-foreground">
                            {formatDateTime(rec.synced_at)}
                          </TableCell>
                          <TableCell>
                            <Badge status={rec.status} kind="sync" />
                          </TableCell>
                          <TableCell class="text-right font-medium text-xs">
                            {rec.items_count} items
                          </TableCell>
                          <TableCell class="text-right text-xs">
                            {rec.orders_count} orders
                          </TableCell>
                          <TableCell class="text-right font-mono text-xs text-muted-foreground">
                            {rec.duration_ms > 0 ? `${rec.duration_ms} ms` : '<1s'}
                          </TableCell>
                          <TableCell class="text-xs text-destructive max-w-[220px] truncate">
                            {rec.error_message || '-'}
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </Show>
              </TableBody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
};
