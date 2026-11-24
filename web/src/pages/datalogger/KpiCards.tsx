import { createMemo } from 'solid-js';
import {
  IconClock,
  IconDatabase,
  IconFileAnalytics,
  IconTemperature,
} from '@tabler/icons-solidjs';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import type { DataloggerSession } from '~/types';
import { formatRelativeAgo } from '~/components/datalogger/format';

interface KpiCardsProps {
  sessions: DataloggerSession[];
}

export function KpiCards(props: KpiCardsProps) {
  const totalRecords = createMemo(() =>
    props.sessions.reduce((sum, s) => sum + s.record_count, 0),
  );

  const humidityCount = createMemo(
    () => props.sessions.filter((s) => s.has_humidity).length,
  );

  const globalTempRange = createMemo(() => {
    const withData = props.sessions.filter((s) => s.record_count > 0);
    if (withData.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const s of withData) {
      if (s.temp_min < min) min = s.temp_min;
      if (s.temp_max > max) max = s.temp_max;
    }
    return { min, max };
  });

  const latestSession = createMemo(() => props.sessions[0] ?? null);

  return (
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card class="p-0">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3.5 sm:px-5">
          <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Sessions
          </CardTitle>
          <IconDatabase class="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="px-3.5 pb-3 sm:px-5">
          <div class="font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
            {props.sessions.length.toLocaleString()}
          </div>
          <p class="mt-0.5 text-[11px] text-muted-foreground truncate">
            {humidityCount()} with humidity
          </p>
        </CardContent>
      </Card>

      <Card class="p-0">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3.5 sm:px-5">
          <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Records
          </CardTitle>
          <IconFileAnalytics class="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="px-3.5 pb-3 sm:px-5">
          <div class="font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
            {totalRecords().toLocaleString()}
          </div>
          <p class="mt-0.5 text-[11px] text-muted-foreground truncate">
            Stored readings
          </p>
        </CardContent>
      </Card>

      <Card class="p-0">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3.5 sm:px-5">
          <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Temp Range
          </CardTitle>
          <IconTemperature class="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="px-3.5 pb-3 sm:px-5">
          <div class="font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
            {globalTempRange()
              ? `${globalTempRange()!.min.toFixed(1)}°–${globalTempRange()!.max.toFixed(1)}°C`
              : '—'}
          </div>
          <p class="mt-0.5 text-[11px] text-muted-foreground truncate">
            Global min to max
          </p>
        </CardContent>
      </Card>

      <Card class="p-0">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3.5 sm:px-5">
          <CardTitle class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Latest Import
          </CardTitle>
          <IconClock class="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="px-3.5 pb-3 sm:px-5">
          <div class="text-xl sm:text-2xl font-bold tracking-tight truncate">
            {latestSession() ? formatRelativeAgo(latestSession()!.created_at) : '—'}
          </div>
          <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
            {latestSession() ? latestSession()!.name : 'No imports'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
