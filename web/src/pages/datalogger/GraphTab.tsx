import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconArrowLeft,
  IconChartLine,
  IconDatabase,
  IconDroplet,
  IconPlus,
  IconRefresh,
  IconX,
} from '@tabler/icons-solidjs';
import { useThemeSignal } from '~/components/chartSetup';
import { DataTable } from '~/components/DataTable';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { dataloggerRecordsPath } from '~/routes';
import type { DataloggerRecord, DataloggerSession } from '~/types';
import { getSessionColor } from '~/components/datalogger/colors';
import {
  computeSessionStats,
  filterRecordsByRange,
  formatDateTimeShort,
  formatDurationMs,
} from '~/components/datalogger/format';
import { ZoomableTimeChart } from '~/components/datalogger/ZoomableTimeChart';

interface GraphTabProps {
  loadedSessions: DataloggerSession[];
  recordsBySession: Record<string, DataloggerRecord[]>;
  onRemoveSession: (id: number) => void;
  onGoToSessions: () => void;
  onClearAllLoaded: () => void;
}

export function GraphTab(props: GraphTabProps) {
  const isDark = useThemeSignal();
  const [fromDate, setFromDate] = createSignal('');
  const [toDate, setToDate] = createSignal('');
  const [showHumidity, setShowHumidity] = createSignal(true);

  const filteredBySession = createMemo(() => {
    const out: Record<string, DataloggerRecord[]> = {};
    const from = fromDate();
    const to = toDate();
    for (const s of props.loadedSessions) {
      out[String(s.id)] = filterRecordsByRange(props.recordsBySession[String(s.id)] ?? [], from, to);
    }
    return out;
  });

  const anyHumidity = createMemo(() => props.loadedSessions.some((s) => s.has_humidity));

  const statsRows = createMemo(() =>
    props.loadedSessions.map((s, idx) => ({
      swatch: getSessionColor(idx, isDark()).swatch,
      stats: computeSessionStats(s, filteredBySession()[String(s.id)] ?? []),
    })),
  );

  return (
    <div class="space-y-6">
      <Show
        when={props.loadedSessions.length > 0}
        fallback={
          <Card>
            <CardContent class="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div class="flex size-12 items-center justify-center rounded-full bg-muted">
                <IconChartLine class="size-6 text-muted-foreground" />
              </div>
              <div class="space-y-1">
                <h3 class="text-base font-semibold">No Sessions Loaded on Graph</h3>
                <p class="max-w-md text-xs text-muted-foreground">
                  Switch to the Sessions Directory tab, select loggers you want to compare, and click "Load Selected" to render synchronized curves here.
                </p>
              </div>
              <Button size="sm" onClick={props.onGoToSessions} class="mt-2">
                <IconArrowLeft class="size-4" />
                Go to Sessions Table
              </Button>
            </CardContent>
          </Card>
        }
      >
        {/* Top Control Bar: Active Sessions Pills + Date Range Filter */}
        <Card>
          <CardHeader class="pb-3 space-y-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle class="text-base">
                  Active Comparison ({props.loadedSessions.length} {props.loadedSessions.length === 1 ? 'session' : 'sessions'})
                </CardTitle>
                <CardDescription>
                  Synchronized thermal curves. Use Time & Vertical zoom or canvas drag to inspect excursions.
                </CardDescription>
              </div>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="outline" class="h-8 text-xs" onClick={props.onGoToSessions}>
                  <IconPlus class="size-3.5" />
                  Select More
                </Button>
                <Button size="sm" variant="ghost" class="h-8 text-xs text-muted-foreground" onClick={props.onClearAllLoaded}>
                  Clear All
                </Button>
              </div>
            </div>

            {/* Session Pills */}
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <For each={props.loadedSessions}>
                {(session, idx) => {
                  const swatch = () => getSessionColor(idx(), isDark()).swatch;
                  return (
                    <span class="inline-flex items-center gap-1.5 rounded-full border bg-secondary/70 pl-2.5 pr-1.5 py-1 text-xs font-medium">
                      <span
                        class="inline-block size-2 shrink-0 rounded-full"
                        style={{ 'background-color': swatch() }}
                      />
                      <span class="max-w-[200px] truncate">{session.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${session.name} from comparison`}
                        onClick={() => props.onRemoveSession(session.id)}
                        class="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <IconX class="size-3" />
                      </button>
                    </span>
                  );
                }}
              </For>
            </div>

            {/* Date Window Inputs */}
            <div class="flex flex-wrap items-center gap-2 border-t pt-3">
              <span class="text-xs font-medium text-muted-foreground">Filter Window:</span>
              <input
                type="datetime-local"
                aria-label="Filter from date"
                value={fromDate()}
                onInput={(e) => setFromDate(e.currentTarget.value)}
                class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
              />
              <span class="text-xs text-muted-foreground">→</span>
              <input
                type="datetime-local"
                aria-label="Filter to date"
                value={toDate()}
                onInput={(e) => setToDate(e.currentTarget.value)}
                class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
              />
              <Show when={fromDate() || toDate()}>
                <Button
                  size="sm"
                  variant="outline"
                  class="h-8"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                  }}
                >
                  <IconRefresh class="size-3.5" />
                  Reset
                </Button>
              </Show>
              <Show when={anyHumidity()}>
                <Button
                  size="sm"
                  variant={showHumidity() ? 'default' : 'outline'}
                  class="h-8 ml-auto"
                  aria-pressed={showHumidity()}
                  onClick={() => setShowHumidity((v) => !v)}
                >
                  <IconDroplet class="size-3.5" />
                  Humidity
                </Button>
              </Show>
            </div>
          </CardHeader>
          <CardContent>
            {/* Full available horizontal width chart with Zoom & Pan */}
            <ZoomableTimeChart
              sessions={props.loadedSessions}
              recordsBySession={filteredBySession()}
              showHumidity={showHumidity()}
              heightClass="h-[420px]"
            />
          </CardContent>
        </Card>

        {/* Per-Session Summary Statistics Table with Direct Raw Data links */}
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">Loaded Sessions Statistics</CardTitle>
            <CardDescription>
              Telemetry metrics computed across the active filter window. Click "View Raw" to inspect unaggregated readings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Device Model</TableHead>
                  <TableHead class="text-right">Plotted Points</TableHead>
                  <TableHead class="text-right">Min Temp</TableHead>
                  <TableHead class="text-right">Avg Temp</TableHead>
                  <TableHead class="text-right">Max Temp</TableHead>
                  <TableHead class="text-right">Humidity (Avg)</TableHead>
                  <TableHead>Recording Window</TableHead>
                  <TableHead class="text-right">Duration</TableHead>
                  <TableHead class="w-32 text-right">Raw Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={statsRows()}>
                  {(row) => (
                    <TableRow>
                      <TableCell class="font-medium">
                        <div class="flex items-center gap-2">
                          <span
                            class="inline-block size-2.5 shrink-0 rounded-full"
                            style={{ 'background-color': row.swatch }}
                          />
                          <span class="truncate max-w-[200px] font-medium">{row.stats.name}</span>
                        </div>
                      </TableCell>
                      <TableCell class="text-xs text-muted-foreground">{row.stats.deviceModel}</TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums">
                        {row.stats.count.toLocaleString()}
                      </TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums">
                        {row.stats.tempMin !== null ? `${row.stats.tempMin.toFixed(1)}°C` : '—'}
                      </TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums">
                        {row.stats.tempAvg !== null ? `${row.stats.tempAvg.toFixed(1)}°C` : '—'}
                      </TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums">
                        {row.stats.tempMax !== null ? `${row.stats.tempMax.toFixed(1)}°C` : '—'}
                      </TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums">
                        {row.stats.humAvg !== null ? `${row.stats.humAvg.toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell class="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {row.stats.startTime
                          ? `${formatDateTimeShort(row.stats.startTime)} → ${formatDateTimeShort(row.stats.endTime)}`
                          : '—'}
                      </TableCell>
                      <TableCell class="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDurationMs(row.stats.durationMs)}
                      </TableCell>
                      <TableCell class="text-right">
                        <A
                          href={dataloggerRecordsPath(row.stats.sessionId)}
                          class="inline-flex h-7 items-center gap-1 rounded border border-input bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted hover:text-foreground"
                        >
                          <IconDatabase class="size-3" />
                          View Raw
                        </A>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </DataTable>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
