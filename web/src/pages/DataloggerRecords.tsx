import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconChartLine,
  IconClock,
  IconDownload,
  IconLoader2,
  IconRefresh,
  IconTemperature,
} from '@tabler/icons-solidjs';
import { getDataloggerRecords, getDataloggerSession } from '~/api';
import { DataTable } from '~/components/DataTable';
import { PageTransition } from '~/components/PageTransition';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { ROUTES } from '~/routes';
import type { DataloggerRecord } from '~/types';
import {
  computeSessionStats,
  filterRecordsByRange,
  formatDateTimeFull,
  formatDateTimeShort,
  formatDurationMs,
  formatRelativeAgo,
} from '~/components/datalogger/format';
import { PaginationControls } from '~/components/datalogger/PaginationControls';
import { ZoomableTimeChart } from '~/components/datalogger/ZoomableTimeChart';

export default function DataloggerRecords() {
  const params = useParams();
  const sessionId = () => Number(params.id);

  const [sessionData, { refetch: refetchSession }] = createResource(sessionId, (id) =>
    getDataloggerSession(id),
  );
  const [recordsData, { refetch: refetchRecords }] = createResource(sessionId, (id) =>
    getDataloggerRecords(id),
  );

  const session = () => sessionData()?.session;
  const rawRecords = () => recordsData()?.records ?? [];

  // Filter & pagination
  const [fromDate, setFromDate] = createSignal('');
  const [toDate, setToDate] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(50);
  const [showHumidity, setShowHumidity] = createSignal(true);

  const filteredRecords = createMemo(() => {
    let list = filterRecordsByRange(rawRecords(), fromDate(), toDate());
    const q = query().trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.timestamp.toLowerCase().includes(q) || r.flags.toLowerCase().includes(q));
    }
    return list;
  });

  createEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRecords().length / Math.max(1, pageSize())));
    if (page() > maxPage) setPage(maxPage);
  });

  const paginatedRecords = createMemo(() => {
    const start = (page() - 1) * pageSize();
    return filteredRecords().slice(start, start + pageSize());
  });

  const stats = createMemo(() => {
    const s = session();
    if (!s) return null;
    return computeSessionStats(s, filteredRecords());
  });

  const handleDownloadCsv = () => {
    const s = session();
    const recs = filteredRecords();
    if (recs.length === 0) return;

    const lines = ['#,Timestamp,Temperature_C,Humidity_RH,Flags'];
    recs.forEach((r, idx) => {
      const hum = r.humidity !== null && r.humidity !== undefined ? r.humidity : '';
      lines.push(`${idx + 1},${r.timestamp},${r.temperature},${hum},"${r.flags || ''}"`);
    });

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(s?.name || 'session').replace(/[^a-zA-Z0-9_-]/g, '_')}_records.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const recordsBySessionMap = createMemo<Record<string, DataloggerRecord[]>>(() => {
    const s = session();
    if (!s) return {};
    return { [String(s.id)]: rawRecords() };
  });

  return (
    <PageTransition>
      <div class="w-full space-y-6 p-4 md:p-6 min-w-0">
        {/* Navigation & Header */}
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <A
                href={ROUTES.datalogger}
                class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <IconArrowLeft class="size-3.5" />
                Back to Data Logger
              </A>
              <span class="text-muted-foreground">/</span>
              <span class="text-xs font-mono text-muted-foreground">Session #{sessionId()}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-2xl font-bold tracking-tight">
                {session()?.name || 'Loading session…'}
              </h1>
              <Show when={session()?.has_humidity}>
                <Badge variant="secondary" class="text-xs">
                  Temperature + Humidity
                </Badge>
              </Show>
            </div>
            <p class="text-xs text-muted-foreground">
              {session()?.device_model || 'Logger'}
              {session()?.serial_number ? ` · Serial ${session()!.serial_number}` : ''}
              {session()?.created_at ? ` · Imported ${formatRelativeAgo(session()!.created_at)} (${formatDateTimeShort(session()!.created_at)})` : ''}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchSession();
                void refetchRecords();
              }}
            >
              <IconRefresh class="size-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadCsv}
              disabled={filteredRecords().length === 0}
            >
              <IconDownload class="size-3.5" />
              Export CSV ({filteredRecords().length.toLocaleString()})
            </Button>
          </div>
        </div>

        <Show when={sessionData.error || recordsData.error}>
          <Alert variant="destructive">
            <IconAlertCircle class="size-4" />
            <AlertTitle>Failed to load session</AlertTitle>
            <AlertDescription>
              {(sessionData.error as Error)?.message || (recordsData.error as Error)?.message || 'Session not found.'}
            </AlertDescription>
          </Alert>
        </Show>

        <Show
          when={!sessionData.loading && session()}
          fallback={
            <div class="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <IconLoader2 class="size-5 animate-spin mr-2" />
              Loading session readings…
            </div>
          }
        >
          {/* KPI Summary Cards for this session */}
          <Show when={stats()}>
            {(st) => (
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Readings
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums">
                      {st().count.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Min Temp
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums text-foreground">
                      {st().tempMin !== null ? `${st().tempMin!.toFixed(1)}°C` : '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Avg Temp
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums text-foreground">
                      {st().tempAvg !== null ? `${st().tempAvg!.toFixed(1)}°C` : '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Max Temp
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums text-foreground">
                      {st().tempMax !== null ? `${st().tempMax!.toFixed(1)}°C` : '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Humidity
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums">
                      {st().humAvg !== null ? `${st().humAvg!.toFixed(0)}% avg` : '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader class="pb-1 pt-3 px-3.5">
                    <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Duration
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="px-3.5 pb-3">
                    <div class="font-mono text-xl font-bold tabular-nums">
                      {formatDurationMs(st().durationMs)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </Show>

          {/* Interactive Single-Session Zoomable Chart */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <CardTitle class="flex items-center gap-2 text-base">
                  <IconChartLine class="size-4" />
                  Thermal Curve
                </CardTitle>
                <div class="font-mono text-xs text-muted-foreground">
                  {session()?.start_time ? `${formatDateTimeShort(session()!.start_time)} → ${formatDateTimeShort(session()!.end_time)}` : ''}
                </div>
              </div>
              <CardDescription>
                Zoom and pan this session's temperature trace using the controls or canvas drag.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ZoomableTimeChart
                sessions={session() ? [session()!] : []}
                recordsBySession={recordsBySessionMap()}
                showHumidity={showHumidity()}
                heightClass="h-[360px]"
              />
            </CardContent>
          </Card>

          {/* Dedicated Raw Records Table */}
          <Card>
            <CardHeader class="space-y-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1">
                  <CardTitle class="text-base">Raw Readings Log</CardTitle>
                  <CardDescription>
                    Individual sensor readings stored for this recording session.
                  </CardDescription>
                </div>

                {/* Filter controls */}
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter timestamp / flag…"
                    value={query()}
                    onInput={(e) => {
                      setQuery(e.currentTarget.value);
                      setPage(1);
                    }}
                    class="h-8 w-44 rounded-md border border-input bg-background px-2.5 text-xs"
                  />
                  <input
                    type="datetime-local"
                    aria-label="From date"
                    value={fromDate()}
                    onInput={(e) => {
                      setFromDate(e.currentTarget.value);
                      setPage(1);
                    }}
                    class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  />
                  <span class="text-xs text-muted-foreground">–</span>
                  <input
                    type="datetime-local"
                    aria-label="To date"
                    value={toDate()}
                    onInput={(e) => {
                      setToDate(e.currentTarget.value);
                      setPage(1);
                    }}
                    class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  />
                  <Show when={fromDate() || toDate() || query()}>
                    <Button
                      size="sm"
                      variant="outline"
                      class="h-8"
                      onClick={() => {
                        setFromDate('');
                        setToDate('');
                        setQuery('');
                        setPage(1);
                      }}
                    >
                      Reset
                    </Button>
                  </Show>
                </div>
              </div>
            </CardHeader>
            <CardContent class="space-y-4">
              <Show
                when={paginatedRecords().length > 0}
                fallback={
                  <div class="rounded-md border border-dashed py-12 text-center text-xs text-muted-foreground">
                    {rawRecords().length === 0 ? 'No records stored for this session.' : 'No readings match active filters.'}
                  </div>
                }
              >
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-16">#</TableHead>
                      <TableHead>Timestamp (ISO UTC)</TableHead>
                      <TableHead>Local Time</TableHead>
                      <TableHead class="text-right">Temperature</TableHead>
                      <TableHead class="text-right">Humidity</TableHead>
                      <TableHead class="w-20">Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={paginatedRecords()}>
                      {(record, idx) => {
                        const globalIndex = () => (page() - 1) * pageSize() + idx() + 1;
                        return (
                          <TableRow>
                            <TableCell class="font-mono text-xs text-muted-foreground">
                              {globalIndex()}
                            </TableCell>
                            <TableCell class="font-mono text-xs">
                              {record.timestamp}
                            </TableCell>
                            <TableCell class="font-mono text-xs text-muted-foreground">
                              {formatDateTimeFull(record.timestamp)}
                            </TableCell>
                            <TableCell class="text-right font-mono text-xs tabular-nums font-medium">
                              {record.temperature.toFixed(1)}°C
                            </TableCell>
                            <TableCell class="text-right font-mono text-xs tabular-nums">
                              {record.humidity !== null && record.humidity !== undefined
                                ? `${record.humidity.toFixed(1)}%`
                                : '—'}
                            </TableCell>
                            <TableCell class="font-mono text-xs">
                              <Show when={record.flags && record.flags !== '—'} fallback={<span class="text-muted-foreground">—</span>}>
                                <Badge variant="outline" class="font-mono text-[10px] px-1 py-0">
                                  {record.flags}
                                </Badge>
                              </Show>
                            </TableCell>
                          </TableRow>
                        );
                      }}
                    </For>
                  </TableBody>
                </DataTable>

                <PaginationControls
                  total={filteredRecords().length}
                  page={page()}
                  pageSize={pageSize()}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[25, 50, 100, 250, 500]}
                  itemLabel="readings"
                />
              </Show>
            </CardContent>
          </Card>
        </Show>
      </div>
    </PageTransition>
  );
}
