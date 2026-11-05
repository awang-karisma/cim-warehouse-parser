import { ROUTES, orderDetailPath } from '~/routes';

import { ORDER_STATUS, USER_ROLE, SYNC_STATUS } from '~/domain';

import { type Component, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconArrowRight,
  IconAlertCircle,
  IconListDetails,
  IconMapPin,
  IconPackage,
  IconRefresh,
  IconTruckDelivery,
  IconUsers,
  IconBuildingWarehouse,
} from '@tabler/icons-solidjs';
	import { getDailyOrderStatusChanges, getDashboardSummary, getDashboardOperations, getDashboardPressure, getOrderStatusTrend, getOrders, getStatus, subscribeSyncEvents, triggerSync } from '~/api';
import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import { Badge } from '~/components/Badge';
import { DataTable } from '~/components/DataTable';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { TableSkeleton } from '~/components/TableSkeleton';
import { getDominantOrderStatus } from '~/utils/orderStatus';
import { Bar, Line } from 'solid-chartjs';
import { hexAlpha, readPalette, useThemeSignal } from '~/components/chartSetup';

const isoDay = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const addCalendarDays = (iso: string, amount: number): string => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const isValidISODate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const dayNumber = (iso: string): number => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

type ChartStyle = 'bar' | 'line';

const ChartTypeSwitch: Component<{
  label: string;
  value: ChartStyle;
  options: { value: ChartStyle; label: string }[];
  onChange: (value: ChartStyle) => void;
}> = (props) => (
  <div role="group" aria-label={props.label} class="inline-flex w-fit shrink-0 rounded-md border bg-background p-0.5">
    <For each={props.options}>{(option) =>
      <button type="button" aria-pressed={props.value === option.value} onClick={() => props.onChange(option.value)}
        class="min-h-10 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        classList={{ 'bg-primary text-primary-foreground': props.value === option.value, 'text-muted-foreground hover:bg-secondary hover:text-foreground': props.value !== option.value }}>
        {option.label}
      </button>
    }</For>
  </div>
);

export const Dashboard: Component = () => {
  const { t, intlLocale, formatRelativeTime } = useI18n();
  const auth = useAuth();
  const today = isoDay(new Date());
  const [fromDate, setFromDate] = createSignal(today);
  const [toDate, setToDate] = createSignal(today);
  const range = createMemo(() => {
    const from = fromDate();
    const to = toDate();
    if (!isValidISODate(from) || !isValidISODate(to) || from > to) return undefined;
    return { from, to };
  });
  const subtractCalendarMonths = (iso: string, months: number): string => {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 - months, 1));
    const clamped = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate())));
    return `${clamped.getUTCFullYear()}-${String(clamped.getUTCMonth() + 1).padStart(2, '0')}-${String(clamped.getUTCDate()).padStart(2, '0')}`;
  };
  const rangePresets = createMemo(() => [
    { key: 'presetToday', label: t('dashboard.presetToday'), from: today },
    { key: 'preset7d', label: t('dashboard.preset7d'), from: addCalendarDays(today, -6) },
    { key: 'preset30d', label: t('dashboard.preset30d'), from: addCalendarDays(today, -29) },
    { key: 'preset3m', label: t('dashboard.preset3m'), from: subtractCalendarMonths(today, 3) },
    { key: 'preset6m', label: t('dashboard.preset6m'), from: subtractCalendarMonths(today, 6) },
    { key: 'preset1y', label: t('dashboard.preset1y'), from: subtractCalendarMonths(today, 12) },
  ]);
  const applyPreset = (from: string) => { setFromDate(from); setToDate(today); };
  const [summary, { refetch: refetchSummary }] = createResource(range, ({ from, to }) => getDashboardSummary({ from, to }));
  const [recentOrders, { refetch: refetchRecentOrders }] = createResource(range, ({ from, to }) => getOrders({ from, to, limit: 5 }));
	const [statusTrend, { refetch: refetchStatusTrend }] = createResource(range, ({ from, to }) => getOrderStatusTrend({ from, to }));
	const [statusChanges, { refetch: refetchStatusChanges }] = createResource(range, ({ from, to }) => getDailyOrderStatusChanges({ from, to }));
  const [pressure, { refetch: refetchPressure }] = createResource(range, ({ from, to }) => getDashboardPressure({ from, to }));
  const [operations, { refetch: refetchOperations }] = createResource(getDashboardOperations);
  const [syncStatus, { refetch: refetchSyncStatus }] = createResource(getStatus);
  const [dailyChartType, setDailyChartType] = createSignal<ChartStyle>('bar');
  const [trendChartType, setTrendChartType] = createSignal<ChartStyle>('line');
  const [deltaChartType, setDeltaChartType] = createSignal<ChartStyle>('bar');
  const [now, setNow] = createSignal(Date.now());
  const [syncing, setSyncing] = createSignal(false);
  const [syncActionError, setSyncActionError] = createSignal('');
  const [syncActionSuccess, setSyncActionSuccess] = createSignal(false);
  let successTimer: number | undefined;
  onCleanup(() => window.clearTimeout(successTimer));
  onMount(() => {
    const refreshAll = () => {
      void refetchSyncStatus();
      void refetchOperations();
      void refetchSummary();
      void refetchRecentOrders();
      void refetchStatusTrend();
	  void refetchStatusChanges();
      void refetchPressure();
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      void refetchSyncStatus();
    }, 30_000);
    const events = subscribeSyncEvents((event) => {
      if (event.status.toUpperCase() === SYNC_STATUS.SUCCESS) refreshAll();
      else if (event.status.toUpperCase() === SYNC_STATUS.ERROR) void refetchSyncStatus();
    });
    onCleanup(() => { clearInterval(timer); events.close(); });
  });
  const lastSuccessfulSync = createMemo(() => {
    const record = syncStatus()?.last_record;
    if (record?.status.toUpperCase() !== SYNC_STATUS.SUCCESS) return null;
    const date = new Date(record.synced_at);
    return Number.isNaN(date.getTime()) ? null : date;
  });
  const syncWarning = createMemo(() => {
    if (syncStatus.error) return t('dashboard.syncStatusUnavailable');
    const status = syncStatus();
    if (!status) return '';
    if (status.error || status.last_record?.status.toUpperCase() === SYNC_STATUS.ERROR) return t('dashboard.syncFailedWarning');
    if (status.status.toUpperCase() === SYNC_STATUS.SYNCING) return '';
    const last = lastSuccessfulSync();
    if (!last) return status.is_inside_work_hours ? t('dashboard.syncMissingWarning') : '';
    return status.is_inside_work_hours && now() - last.getTime() > 30 * 60_000 ? t('dashboard.syncStaleWarning') : '';
  });
  const canSync = () => auth.user()?.role === USER_ROLE.ADMIN || auth.user()?.role === USER_ROLE.SUPERADMIN;
  const syncNow = async () => {
    if (syncing()) return;
    window.clearTimeout(successTimer);
    setSyncing(true);
    setSyncActionError('');
    setSyncActionSuccess(false);
    try {
      await triggerSync();
	  await Promise.all([refetchSyncStatus(), refetchOperations(), refetchSummary(), refetchRecentOrders(), refetchStatusTrend(), refetchStatusChanges(), refetchPressure()]);
      setSyncActionSuccess(true);
      successTimer = window.setTimeout(() => setSyncActionSuccess(false), 6000);
    } catch (error) {
      setSyncActionError(t('dashboard.syncActionFailed', { message: error instanceof Error ? error.message : t('sync.syncFailed') }));
      void refetchSyncStatus();
    } finally {
      setSyncing(false);
    }
  };
  const ordersInRange = (filters: Record<string, string>) => `${ROUTES.orders}?${new URLSearchParams({ from: fromDate(), to: toDate(), ...filters })}`;
  const leadTimeValue = () => pressure()?.average_lead_time?.toLocaleString(intlLocale(), { maximumFractionDigits: 2 });

  const statusSegments = createMemo(() => {
    const counts = summary()?.status_counts ?? {};
    let selesai = 0;
    let proses = 0;
    let belumSelesai = 0;
    let pending = 0;
    let batal = 0;
    let other = 0;
    for (const [status, count] of Object.entries(counts)) {
      const upper = status.trim().toUpperCase();
		if (upper === ORDER_STATUS.COMPLETE || upper === 'COMPLETED') selesai += count;
		else if (upper === ORDER_STATUS.PROCESSING || upper === 'PARTIAL') proses += count;
		else if (upper === ORDER_STATUS.UNFINISHED) belumSelesai += count;
		else if (upper === ORDER_STATUS.PENDING) pending += count;
		else if (upper === ORDER_STATUS.CANCELLED || upper === ORDER_STATUS.CANCEL) batal += count;
		else other += count;
	}
	const total = selesai + proses + belumSelesai + pending + batal + other;
	const series = [
		{ key: ORDER_STATUS.COMPLETE, label: t('status.selesai'), count: selesai, color: 'var(--color-status-selesai)' },
		{ key: ORDER_STATUS.PROCESSING, label: t('status.proses'), count: proses, color: 'var(--color-status-proses)' },
		{ key: ORDER_STATUS.UNFINISHED, label: t('status.belumSelesai'), count: belumSelesai, color: 'var(--color-status-belum-selesai)' },
		{ key: ORDER_STATUS.PENDING, label: t('status.pending'), count: pending, color: 'var(--color-status-pending)' },
		{ key: ORDER_STATUS.CANCELLED, label: t('status.batal'), count: batal, color: 'var(--color-status-batal)' },
		{ key: 'OTHER', label: t('dashboard.otherStatus'), count: other, color: 'var(--color-muted-foreground)' },
	];
	return { total, series: series.filter((item) => item.count > 0) };
});

  const isDark = useThemeSignal();
  const palette = createMemo(() => readPalette(isDark()));

  const dailyPoints = createMemo(() => {
    const selected = range();
    if (!selected) return [];
    const counts = new Map((summary()?.daily_orders ?? []).map((point) => [point.date.slice(0, 10), point.count]));
    const result: { date: string; count: number }[] = [];
    for (let day = dayNumber(selected.from); day <= dayNumber(selected.to); day++) {
      const date = addCalendarDays(selected.from, day - dayNumber(selected.from));
      result.push({ date, count: counts.get(date) ?? 0 });
    }
    return result;
  });

  const formatChartDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  };

  // Bucket daily bars into weeks beyond 14 days so the chart stays inside the viewport
  // instead of growing a 10,000px horizontal runway on the 1Y preset.
  interface DailyBucket { label: string; startDate: string; endDate: string; count: number }
  const dailyBuckets = createMemo((): DailyBucket[] => {
    const points = dailyPoints();
    if (points.length <= 14) {
      return points.map((point) => ({ label: formatChartDate(point.date), startDate: point.date, endDate: point.date, count: point.count }));
    }
    const buckets: DailyBucket[] = [];
    for (let i = 0; i < points.length; i += 7) {
      const slice = points.slice(i, i + 7);
      buckets.push({
        label: formatChartDate(slice[0].date),
        startDate: slice[0].date,
        endDate: slice[slice.length - 1].date,
        count: slice.reduce((sum, point) => sum + point.count, 0),
      });
    }
    return buckets;
  });

  const dailyChartData = createMemo(() => {
    const p = palette();
    return {
      labels: dailyBuckets().map((bucket) => bucket.label),
      datasets: [{
        data: dailyBuckets().map((bucket) => bucket.count),
        // Zero-count buckets still draw a ghost track so the day/week reads as
        // "no orders" instead of an empty hole, and always-visible minimum keeps
        // small values discernible on touch screens.
        backgroundColor: dailyBuckets().map((bucket) => (bucket.count > 0 ? p.primary : hexAlpha('#71717a', 0.18))),
        minBarLength: 3,
        borderRadius: 2,
        maxBarThickness: 20,
      }],
    };
  });

  const dailyLineData = createMemo(() => ({
    labels: dailyChartData().labels,
    datasets: [{
      data: dailyChartData().datasets[0].data,
      borderColor: palette().primary,
      backgroundColor: palette().primary,
      borderWidth: 2,
      pointRadius: dailyBuckets().length > 30 ? 2 : 3,
      pointHoverRadius: 5,
      tension: 0,
    }],
  }));

  const dailyChartOptions = createMemo(() => {
    const p = palette();
    const buckets = dailyBuckets();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.card,
          titleColor: p.foreground,
          bodyColor: p.muted,
          borderColor: p.border,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items: { dataIndex: number }[]) => {
              const bucket = buckets[items[0]?.dataIndex ?? 0];
              if (!bucket) return '';
              return bucket.startDate === bucket.endDate
                ? formatChartDate(bucket.startDate)
                : `${formatChartDate(bucket.startDate)} – ${formatChartDate(bucket.endDate)}`;
            },
            label: (item: { parsed: { y: number } }) => `${item.parsed.y.toLocaleString()} ${t('dashboard.ordersUnit')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: p.border },
          ticks: { color: p.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 24 },
        },
        y: {
          beginAtZero: true,
          grid: { color: p.border },
          border: { display: false },
          ticks: { color: p.muted, font: { size: 10 }, precision: 0, maxTicksLimit: 5 },
        },
      },
    };
  });

	const trendSeries = createMemo(() => {
		const p = palette();
		return [
			{ key: ORDER_STATUS.COMPLETE, label: t('status.selesai'), color: p.selesai },
			{ key: ORDER_STATUS.PROCESSING, label: t('status.proses'), color: p.proses },
			{ key: ORDER_STATUS.UNFINISHED, label: t('status.belumSelesai'), color: p.belumSelesai },
			{ key: ORDER_STATUS.PENDING, label: t('status.pending'), color: p.pending },
			{ key: ORDER_STATUS.CANCELLED, label: t('status.batal'), color: p.batal },
			{ key: 'OTHER', label: t('dashboard.otherStatus'), color: p.other },
		];
	});

	const normalizeStatusCounts = (raw: Record<string, number>) => {
		const counts: Record<string, number> = {
			[ORDER_STATUS.COMPLETE]: 0, [ORDER_STATUS.PROCESSING]: 0, [ORDER_STATUS.UNFINISHED]: 0,
			[ORDER_STATUS.PENDING]: 0, [ORDER_STATUS.CANCELLED]: 0, OTHER: 0,
		};
		for (const [status, count] of Object.entries(raw)) {
			const upper = status.trim().toUpperCase();
			const key = upper === 'COMPLETED' ? ORDER_STATUS.COMPLETE
				: upper === 'PARTIAL' ? ORDER_STATUS.PROCESSING
					: upper === ORDER_STATUS.CANCEL ? ORDER_STATUS.CANCELLED
						: upper in counts ? upper : 'OTHER';
			counts[key] += count;
		}
		return counts;
	};

	const snapshotPoints = createMemo(() => (statusTrend()?.points ?? []).map((point) => ({
		date: point.date.slice(0, 10), counts: normalizeStatusCounts(point.status_counts ?? {}),
	})));

	const trendPoints = createMemo(() => snapshotPoints().filter((point) => {
		const selected = range();
		return !!selected && point.date >= selected.from && point.date <= selected.to;
	}));

	const deltaPoints = createMemo(() => {
		const changesByDate = new Map((statusChanges()?.points ?? []).map((point) => [point.date.slice(0, 10), normalizeStatusCounts(point.entered_status_counts ?? {})]));
		return dailyPoints().map(({ date }) => ({ date, counts: changesByDate.get(date) ?? null }));
	});

  const trendChartData = createMemo(() => {
    const points = trendPoints();
    const byDate = new Map(points.map((point) => [point.date, point.counts]));
    // Labels span the whole selected range so a single snapshot sits at its real
    // position on the axis instead of collapsing to a lonely dot on the left edge.
    const labels = dailyPoints().map((point) => point.date);
    const labelSet = new Set(labels);
    for (const point of points) {
      if (!labelSet.has(point.date)) labels.push(point.date);
    }
    labels.sort();
    return {
      labels: labels.map((date) => formatChartDate(date)),
      // Nulls preserve days without snapshots as gaps; a single snapshot still
      // renders as a point at its date rather than disappearing.
      datasets: trendSeries().map((series) => ({
        label: series.label,
        data: labels.map((date) => byDate.get(date)?.[series.key] ?? null),
        borderColor: series.color,
        backgroundColor: series.color,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.25,
        spanGaps: false,
      })),
    };
  });

  const trendBarData = createMemo(() => ({
    labels: trendChartData().labels,
    datasets: trendChartData().datasets.map((series) => ({
      label: series.label,
      data: series.data,
      backgroundColor: series.backgroundColor,
      stack: 'status',
      maxBarThickness: 18,
    })),
  }));

  const trendChartOptions = createMemo(() => {
    const p = palette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: p.muted, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, padding: 16 },
        },
        tooltip: {
          backgroundColor: p.card,
          titleColor: p.foreground,
          bodyColor: p.muted,
          borderColor: p.border,
          borderWidth: 1,
          padding: 10,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: p.border },
          ticks: { color: p.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: true,
          grid: { color: p.border },
          border: { display: false },
          ticks: { color: p.muted, font: { size: 10 }, precision: 0, maxTicksLimit: 6 },
        },
      },
    };
  });

  const trendBarOptions = createMemo(() => {
    const options = trendChartOptions();
    return {
      ...options,
      plugins: { ...options.plugins, legend: { ...options.plugins.legend, labels: { ...options.plugins.legend.labels, pointStyle: 'rect' as const } } },
      scales: { x: { ...options.scales.x, stacked: true }, y: { ...options.scales.y, stacked: true } },
    };
  });


  const deltaChartData = createMemo(() => ({
    labels: deltaPoints().map((point) => formatChartDate(point.date)),
    datasets: trendSeries().map((series) => ({
      label: series.label,
      data: deltaPoints().map((point) => point.counts?.[series.key] ?? null),
      backgroundColor: series.color,
      stack: 'status',
      maxBarThickness: 18,
    })),
  }));

  const deltaLineData = createMemo(() => ({
    labels: deltaChartData().labels,
    datasets: deltaChartData().datasets.map((series) => ({
      label: series.label,
      data: series.data,
      borderColor: series.backgroundColor,
      backgroundColor: series.backgroundColor,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0,
      spanGaps: false,
    })),
  }));

  const deltaChartOptions = createMemo(() => {
    const p = palette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: p.muted, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rect', font: { size: 11 }, padding: 16 },
        },
        tooltip: {
          backgroundColor: p.card,
          titleColor: p.foreground,
          bodyColor: p.muted,
          borderColor: p.border,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items: { dataIndex: number }[]) => deltaPoints()[items[0]?.dataIndex ?? 0]?.date ?? '',
			label: (item: { dataset: { label?: string }; parsed: { y: number } }) => `${item.dataset.label}: ${item.parsed.y.toLocaleString(intlLocale())} ${t('dashboard.ordersUnit')}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { color: p.border },
          ticks: { color: p.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: p.border },
          border: { display: false },
			ticks: { color: p.muted, font: { size: 10 }, precision: 0, maxTicksLimit: 6 },
        },
      },
    };
  });

  const deltaLineOptions = createMemo(() => {
    const options = deltaChartOptions();
    return {
      ...options,
      plugins: { ...options.plugins, legend: { ...options.plugins.legend, labels: { ...options.plugins.legend.labels, pointStyle: 'circle' as const } } },
      scales: { x: { ...options.scales.x, stacked: false }, y: { ...options.scales.y, stacked: false } },
    };
  });

  return (
    <div class="flex flex-1 flex-col gap-6 min-w-0">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
        <div class="flex min-w-0 items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" classList={{ 'bg-status-batal': !!syncWarning(), 'bg-status-proses': !syncWarning() && (syncing() || syncStatus()?.status.toUpperCase() === SYNC_STATUS.SYNCING), 'bg-status-selesai': !syncWarning() && !syncing() && syncStatus()?.status.toUpperCase() !== SYNC_STATUS.SYNCING && !!lastSuccessfulSync(), 'bg-muted-foreground': !syncWarning() && !syncing() && !lastSuccessfulSync() }} aria-hidden="true" />
          <Show when={!syncStatus.loading} fallback={<Skeleton class="h-4 w-36" />}>
            <span>{lastSuccessfulSync() ? t('dashboard.syncFreshness', {
              time: formatRelativeTime(lastSuccessfulSync()!, now()),
              clock: new Intl.DateTimeFormat(intlLocale(), { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false }).format(lastSuccessfulSync()!),
            }) : syncStatus.error ? t('dashboard.syncStatusUnavailable') : t('dashboard.noSuccessfulSync')}</span>
          </Show>
        </div>
        <A href={ROUTES.sync} class="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('syncManager.liveState')} <IconArrowRight class="size-3.5" aria-hidden="true" /></A>
      </div>
      <Show when={syncWarning() || syncActionError() || syncActionSuccess()}>
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm" role={syncWarning() || syncActionError() ? 'alert' : 'status'} classList={{ 'border-destructive/30 bg-destructive/10': !!syncWarning() || !!syncActionError() }}>
          <span class="flex min-w-0 items-center gap-2"><IconAlertCircle class="size-4 shrink-0" aria-hidden="true" />{syncActionError() || syncWarning() || t('dashboard.syncActionSuccess')}</span>
          <Show when={canSync() && (syncWarning() || syncActionError())} fallback={<A href={ROUTES.sync} class="text-sm font-medium underline underline-offset-4">{t('syncManager.liveState')}</A>}>
            <Button size="sm" variant="outline" disabled={syncing()} onClick={syncNow} class="gap-2"><IconRefresh class="size-4" classList={{ 'animate-spin': syncing() }} />{syncing() ? t('sync.syncing') : t('sync.syncNow')}</Button>
          </Show>
        </div>
      </Show>

      <section class="rounded-lg border bg-card" aria-label={t('dashboard.operationsTitle')}>
        <div class="px-4 pb-3 pt-4 md:px-6"><h2 class="text-base font-semibold">{t('dashboard.operationsTitle')}</h2><p class="text-sm text-muted-foreground">{t('dashboard.operationsDesc')}</p></div>
        <Show when={!operations.error} fallback={<div class="flex items-center justify-between gap-3 border-t px-4 py-4 text-sm md:px-6" role="alert"><span>{t('dashboard.operationsLoadError')}</span><Button variant="outline" size="sm" onClick={() => refetchOperations()}><IconRefresh class="size-4" />{t('common.retry')}</Button></div>}>
          <div class="grid border-t md:grid-cols-3 md:divide-x">
            <A href={`${ROUTES.orders}?status=${encodeURIComponent(ORDER_STATUS.UNFINISHED)}`} class="group flex min-w-0 items-center gap-3 border-b px-4 py-4 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:border-b-0 md:px-6">
              <IconPackage class="size-5 shrink-0 text-status-belum-selesai" aria-hidden="true" />
              <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{t('dashboard.backlogOrders')}</span><span class="block text-xs text-muted-foreground">{t('dashboard.backlogDesc')}</span></span>
              <Show when={!operations.loading} fallback={<Skeleton class="h-7 w-10" />}><strong class="text-xl font-semibold tabular-nums">{operations()?.active_backlog_orders.toLocaleString(intlLocale()) ?? '0'}</strong></Show>
              <IconArrowRight class="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </A>
            <A href={`${ROUTES.items}?ready_to_dispatch=true`} class="group flex min-w-0 items-center gap-3 border-b px-4 py-4 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:border-b-0 md:px-6">
              <IconBuildingWarehouse class="size-5 shrink-0 text-status-proses" aria-hidden="true" />
              <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{t('dashboard.shelfReady')}</span><span class="block text-xs text-muted-foreground">{t('dashboard.shelfReadyDesc')}</span></span>
              <Show when={!operations.loading} fallback={<Skeleton class="h-7 w-10" />}><strong class="text-xl font-semibold tabular-nums">{operations()?.shelf_ready_items.toLocaleString(intlLocale()) ?? '0'}</strong></Show>
              <IconArrowRight class="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </A>
            <A href={`${ROUTES.deliveryFlow}?tab=runs`} class="group flex min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-6">
              <IconTruckDelivery class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{t('dashboard.activeRuns')}</span><span class="block text-xs text-muted-foreground">{t('dashboard.activeRunsDesc')}</span></span>
              <Show when={!operations.loading} fallback={<Skeleton class="h-7 w-10" />}><strong class="text-xl font-semibold tabular-nums">{operations()?.active_runs.toLocaleString(intlLocale()) ?? '0'}</strong></Show>
              <IconArrowRight class="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </A>
          </div>
        </Show>
      </section>
      <section class="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          class="flex w-full flex-col items-stretch rounded-md border bg-background text-sm transition-colors focus-within:ring-2 focus-within:ring-ring sm:w-auto sm:flex-row sm:items-center"
          classList={{ 'border-destructive/60': !range(), 'border-input': !!range() }}
        >
          <label class="flex h-10 min-w-0 items-center gap-2 border-b px-3 sm:flex-none sm:border-b-0 sm:pl-3 sm:pr-0">
            <span class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dashboard.dateFrom')}</span>
            <input type="date" value={fromDate()} aria-label={t('dashboard.dateFrom')} aria-invalid={!isValidISODate(fromDate()) || (!!toDate() && isValidISODate(toDate()) && fromDate() > toDate())}
              onInput={(event) => setFromDate(event.currentTarget.value)}
              class="h-full min-w-0 flex-1 bg-transparent pr-1 text-sm focus:outline-none sm:flex-none" />
          </label>
          <span class="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
          <svg class="hidden size-3.5 shrink-0 text-muted-foreground sm:block" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
          <span class="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
          <label class="flex h-10 min-w-0 items-center gap-2 px-3 sm:flex-none sm:pl-2 sm:pr-3">
            <span class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dashboard.dateTo')}</span>
            <input type="date" value={toDate()} aria-label={t('dashboard.dateTo')} aria-invalid={!isValidISODate(toDate()) || (!!fromDate() && isValidISODate(fromDate()) && fromDate() > toDate())}
              onInput={(event) => setToDate(event.currentTarget.value)}
              class="h-full min-w-0 flex-1 bg-transparent pr-1 text-sm focus:outline-none sm:flex-none" />
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-1 sm:justify-end" role="group" aria-label={t('dashboard.presetRangeLabel')}>
          <For each={rangePresets()}>{(preset) => {
            const isActive = () => range() !== undefined && fromDate() === preset.from && toDate() === today;
            return (
              <button type="button" onClick={() => applyPreset(preset.from)}
                class="min-h-10 rounded-md px-2.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
                classList={{
                  'bg-primary text-primary-foreground': isActive(),
                  'text-muted-foreground hover:bg-secondary hover:text-foreground': !isActive(),
                }}
                aria-pressed={isActive()}>
                {preset.label}
              </button>
            );
          }}</For>
        </div>
        <Show when={!range()}>
          <p class="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5" /><circle cx="8" cy="11" r="0.75" fill="currentColor" stroke="none" /></svg>
            {t('dashboard.invalidRange')}
          </p>
        </Show>
      </section>

      <Show when={range()}>
        <Show when={!summary.error} fallback={
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
            <span>{t('dashboard.loadError')}</span>
            <Button variant="outline" size="sm" onClick={() => refetchSummary()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
          </div>
        }>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <A href={`${ROUTES.orders}?from=${fromDate()}&to=${toDate()}`} class="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t('dashboard.totalOrders')}>
              <Card class="h-full transition-colors group-hover:bg-secondary/50">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.totalOrders')}</CardTitle><IconPackage class="size-4 text-muted-foreground" /></CardHeader>
                <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.total_orders.toLocaleString(intlLocale()) ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.totalOrdersDesc')}</p></Show></CardContent>
              </Card>
            </A>
            <A href={ROUTES.items} class="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t('dashboard.viewAllRecords')}>
              <Card class="h-full transition-colors group-hover:bg-secondary/50">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.totalLineItems')}</CardTitle><IconListDetails class="size-4 text-muted-foreground" /></CardHeader>
                <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.total_items.toLocaleString(intlLocale()) ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.totalLineItemsDesc')}</p></Show></CardContent>
              </Card>
            </A>
            <A href={ROUTES.customers} class="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t('dashboard.viewAllRecords')}>
              <Card class="h-full transition-colors group-hover:bg-secondary/50">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.uniqueCustomers')}</CardTitle><IconUsers class="size-4 text-muted-foreground" /></CardHeader>
                <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.unique_customers.toLocaleString(intlLocale()) ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.uniqueCustomersDesc')}</p></Show></CardContent>
              </Card>
            </A>
            <A href={ROUTES.areas} class="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t('dashboard.viewAllRecords')}>
              <Card class="h-full transition-colors group-hover:bg-secondary/50">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.coverageAreas')}</CardTitle><IconMapPin class="size-4 text-muted-foreground" /></CardHeader>
                <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.unique_areas.toLocaleString(intlLocale()) ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.coverageAreasDesc')}</p></Show></CardContent>
              </Card>
            </A>
          </div>
          <p class="-mt-3 text-xs text-muted-foreground">{t('dashboard.kpiDrilldownNote')}</p>

          <div class="grid min-w-0 gap-6 lg:grid-cols-2">
            <Card class="min-w-0">
              <CardHeader><CardTitle class="text-base font-semibold">{t('dashboard.statusDistribution')}</CardTitle><CardDescription>{t('dashboard.statusDistributionDesc')}</CardDescription></CardHeader>
              <CardContent class="flex flex-col gap-4">
                <Show when={!summary.loading} fallback={<div class="space-y-4"><Skeleton class="h-3 w-full" /><TableSkeleton columns={3} rows={3} /></div>}>
                  <Show when={statusSegments().total > 0} fallback={<p class="py-4 text-sm text-muted-foreground">{t('dashboard.noDistributionData')}</p>}>
                    <div class="flex h-3 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={t('dashboard.statusBreakdown', { total: statusSegments().total })}>
                      <For each={statusSegments().series}>{(segment) => <div class="h-full" style={{ width: `${(segment.count / statusSegments().total) * 100}%`, 'background-color': segment.color }} />}</For>
                    </div>
                    <DataTable>
                      <TableHeader><TableRow><TableHead>{t('dashboard.status')}</TableHead><TableHead class="text-right">{t('dashboard.count')}</TableHead><TableHead class="text-right">{t('dashboard.share')}</TableHead></TableRow></TableHeader>
                      <TableBody>
                        <For each={Object.entries(summary()?.status_counts ?? {})}>{([status, count]) => {
                          const pct = Math.round((count / (summary()?.total_items || 1)) * 100);
                          return <TableRow><TableCell><Badge status={status} kind="order" /></TableCell><TableCell class="text-right font-medium tabular-nums">{count.toLocaleString()}</TableCell><TableCell class="text-right text-muted-foreground tabular-nums">{pct}%</TableCell></TableRow>;
                        }}</For>
                      </TableBody>
                    </DataTable>
                  </Show>
                </Show>
              </CardContent>
            </Card>

            <Card class="min-w-0">
              <CardHeader class="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div><CardTitle class="text-base font-semibold">{t('dashboard.dailyOrders')}</CardTitle><CardDescription>{t('dashboard.dailyOrdersDesc')}</CardDescription></div>
                <Show when={!summary.loading && dailyPoints().some((point) => point.count > 0)}>
                  <ChartTypeSwitch label={t('dashboard.chartTypeFor', { chart: t('dashboard.dailyOrders') })} value={dailyChartType()}
                    options={[{ value: 'bar', label: t('dashboard.barChart') }, { value: 'line', label: t('dashboard.lineChart') }]} onChange={setDailyChartType} />
                </Show>
              </CardHeader>
              <CardContent>
                <Show when={!summary.loading} fallback={<Skeleton class="h-56 w-full" />}>
                  <Show when={dailyPoints().some((point) => point.count > 0)} fallback={<p class="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noDailyOrders')}</p>}>
                    <div class="relative h-56 w-full" role="img" aria-label={t('dashboard.dailyOrdersDesc')}>
                      <Show when={dailyChartType() === 'bar'} fallback={<Line data={dailyLineData()} options={dailyChartOptions()} />}>
                        <Bar data={dailyChartData()} options={dailyChartOptions()} />
                      </Show>
                    </div>
                    <ul class="sr-only"><For each={dailyPoints()}>{(point) => <li>{t('dashboard.dailyOrdersPoint', { date: formatChartDate(point.date), count: point.count })}</li>}</For></ul>
                  </Show>
                </Show>
              </CardContent>
            </Card>
          </div>
        </Show>

        <section class="overflow-hidden rounded-lg border bg-card" aria-labelledby="dashboard-pressure-title">
          <div class="px-4 py-4 md:px-6 md:py-5">
            <h2 id="dashboard-pressure-title" class="text-base font-semibold">{t('dashboard.pressureTitle')}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{t('dashboard.pressureDesc')}</p>
          </div>
          <Show when={!pressure.error} fallback={
            <div class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 text-sm md:px-6" role="alert">
              <span>{t('dashboard.pressureLoadError')}</span>
              <Button variant="outline" size="sm" onClick={() => refetchPressure()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
            </div>
          }>
            <Show when={!pressure.loading} fallback={
              <div class="grid gap-6 border-t px-4 py-5 md:grid-cols-2 md:px-6"><div class="space-y-3"><Skeleton class="h-5 w-40" /><Skeleton class="h-12 w-full" /><Skeleton class="h-12 w-full" /></div><div class="space-y-3"><Skeleton class="h-5 w-48" /><Skeleton class="h-12 w-full" /><Skeleton class="h-12 w-full" /></div></div>
            }>
              <Show when={(pressure()?.areas.length ?? 0) + (pressure()?.customers.length ?? 0) > 0} fallback={
                <div class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-6 text-sm text-muted-foreground md:px-6">
                  <span>{t('dashboard.pressureEmpty')}</span>
                  <Button variant="outline" size="sm" onClick={() => applyPreset(addCalendarDays(today, -29))}>{t('dashboard.pressureExpandRange')}</Button>
                </div>
              }>
                <div class="grid border-t md:grid-cols-2 md:divide-x">
                  <div class="min-w-0 px-4 py-5 md:px-6">
                    <h3 class="mb-3 text-sm font-semibold">{t('dashboard.areaPressure')}</h3>
                    <ol class="space-y-1">
                      <For each={pressure()?.areas}>{(area) => <li>
                        <A href={ordersInRange({ area: area.name })} class="group block rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <div class="flex items-baseline justify-between gap-3 text-sm"><span class="min-w-0 font-medium group-hover:underline">{area.name}</span><strong class="shrink-0 font-semibold tabular-nums">{area.unfinished_items.toLocaleString(intlLocale())}</strong></div>
                          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div class="h-full rounded-full bg-muted-foreground/70" style={{ width: `${100 * area.unfinished_items / (pressure()?.areas[0]?.unfinished_items || 1)}%` }} /></div>
                          <Show when={area.pending_items > 0}><span class="mt-1 block text-xs text-status-pending">{t('dashboard.pendingItems', { count: area.pending_items })}</span></Show>
                          <span class="sr-only">{t('dashboard.openAreaOrders', { name: area.name })}. {t('dashboard.unfinishedItems', { count: area.unfinished_items })}</span>
                        </A>
                      </li>}</For>
                    </ol>
                  </div>
                  <div class="min-w-0 border-t px-4 py-5 md:border-t-0 md:px-6">
                    <h3 class="mb-3 text-sm font-semibold">{t('dashboard.customerPressure')}</h3>
                    <ol class="space-y-1">
                      <For each={pressure()?.customers}>{(customer) => <li>
                        <A href={ordersInRange({ customer: customer.name })} class="group block rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <div class="flex items-baseline justify-between gap-3 text-sm"><span class="min-w-0 font-medium group-hover:underline">{customer.name}</span><strong class="shrink-0 font-semibold tabular-nums">{customer.unfinished_items.toLocaleString(intlLocale())}</strong></div>
                          <Show when={customer.area}><span class="block text-xs text-muted-foreground">{customer.area}</span></Show>
                          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div class="h-full rounded-full bg-muted-foreground/70" style={{ width: `${100 * customer.unfinished_items / (pressure()?.customers[0]?.unfinished_items || 1)}%` }} /></div>
                          <Show when={customer.pending_items > 0}><span class="mt-1 block text-xs text-status-pending">{t('dashboard.pendingItems', { count: customer.pending_items })}</span></Show>
                          <span class="sr-only">{t('dashboard.openCustomerOrders', { name: customer.name })}. {t('dashboard.unfinishedItems', { count: customer.unfinished_items })}</span>
                        </A>
                      </li>}</For>
                    </ol>
                  </div>
                </div>
              </Show>
              <div class="flex flex-wrap items-center justify-between gap-4 border-t bg-secondary/20 px-4 py-4 md:px-6">
                <div class="min-w-0">
                  <h3 class="text-sm font-semibold">{t('dashboard.averageLeadTime')}</h3>
                  <p class="mt-1 text-xs text-muted-foreground">{t('dashboard.leadTimeMethod')}</p>
                </div>
                <div class="min-w-0 w-full text-left md:w-auto md:text-right">
                  <Show when={leadTimeValue()} fallback={<span class="text-sm text-muted-foreground">{t('dashboard.noCompletedItems')}</span>}>
                    <strong class="block text-xl font-semibold tabular-nums">{t('dashboard.averageLeadTimeValue', { value: leadTimeValue()! })}</strong>
                    <span class="text-xs text-muted-foreground">{t('dashboard.completedItems', { count: pressure()?.completed_items ?? 0 })}</span>
                    <A href={ordersInRange({ status: ORDER_STATUS.COMPLETE })} class="mt-1 block text-xs font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('dashboard.viewCompletedOrders')}</A>
                  </Show>
                </div>
              </div>
            </Show>
          </Show>
        </section>

        <Card class="min-w-0">
          <CardHeader class="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle class="text-base font-semibold">{t('dashboard.statusTrend')}</CardTitle><CardDescription>{t('dashboard.statusTrendDesc')}</CardDescription></div>
            <Show when={!statusTrend.loading && !statusTrend.error && trendPoints().length > 0}>
              <ChartTypeSwitch label={t('dashboard.chartTypeFor', { chart: t('dashboard.statusTrend') })} value={trendChartType()}
                options={[{ value: 'line', label: t('dashboard.lineChart') }, { value: 'bar', label: t('dashboard.stackedBarChart') }]} onChange={setTrendChartType} />
            </Show>
          </CardHeader>
          <CardContent>
            <Show when={!statusTrend.error} fallback={
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
                <span>{t('dashboard.loadError')}</span>
                <Button variant="outline" size="sm" onClick={() => refetchStatusTrend()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
              </div>
            }>
              <Show when={!statusTrend.loading} fallback={<Skeleton class="h-64 w-full" />}>
                <Show when={trendPoints().length > 0} fallback={<p class="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noStatusHistory')}</p>}>
                  <div class="relative h-64 w-full" role="img" aria-label={t('dashboard.statusTrend')}>
                    <Show when={trendChartType() === 'line'} fallback={<Bar data={trendBarData()} options={trendBarOptions()} />}>
                      <Line data={trendChartData()} options={trendChartOptions()} />
                    </Show>
                  </div>
                  <div class="sr-only">
                    <p>{t('dashboard.statusTrend')}</p>
                    <ul><For each={trendPoints()}>{(point) => {
                      const values = () => trendSeries().map((series) => `${series.label}: ${point.counts[series.key]}`).join(', ');
                      const total = () => Object.values(point.counts).reduce((sum, count) => sum + count, 0);
                      return <li>{t('dashboard.statusTrendPoint', { date: formatChartDate(point.date), count: total() })}. {values()}</li>;
                    }}</For></ul>
                  </div>
                </Show>
              </Show>
            </Show>
          </CardContent>
        </Card>

        <Card class="min-w-0">
          <CardHeader class="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle class="text-base font-semibold">{t('dashboard.statusDelta')}</CardTitle><CardDescription>{t('dashboard.statusDeltaDesc')}</CardDescription></div>
			<Show when={!statusChanges.loading && !statusChanges.error && deltaPoints().some((point) => point.counts !== null)}>
              <ChartTypeSwitch label={t('dashboard.chartTypeFor', { chart: t('dashboard.statusDelta') })} value={deltaChartType()}
                options={[{ value: 'bar', label: t('dashboard.stackedBarChart') }, { value: 'line', label: t('dashboard.lineChart') }]} onChange={setDeltaChartType} />
            </Show>
          </CardHeader>
          <CardContent>
			<Show when={!statusChanges.error} fallback={
			  <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
				<span>{t('dashboard.loadError')}</span>
				<Button variant="outline" size="sm" onClick={() => refetchStatusChanges()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
			  </div>
			}>
			  <Show when={!statusChanges.loading} fallback={<Skeleton class="h-64 w-full" />}>
				<Show when={deltaPoints().some((point) => point.counts !== null)} fallback={<p class="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noStatusDelta')}</p>}>
                  <div class="relative h-64 w-full" role="img" aria-label={t('dashboard.statusDelta')}>
                    <Show when={deltaChartType() === 'bar'} fallback={<Line data={deltaLineData()} options={deltaLineOptions()} />}>
                      <Bar data={deltaChartData()} options={deltaChartOptions()} />
                    </Show>
                  </div>
                  <div class="sr-only">
                    <p>{t('dashboard.statusDeltaDesc')}</p>
                    <ul><For each={deltaPoints().filter((point) => point.counts !== null)}>{(point) =>
					  <li>{t('dashboard.statusDeltaPoint', { date: point.date })}: {trendSeries().map((series) => `${series.label} ${point.counts![series.key].toLocaleString(intlLocale())}`).join(', ')}</li>
                    }</For></ul>
                  </div>
                </Show>
              </Show>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle class="text-base font-semibold">{t('dashboard.recentOrders')}</CardTitle><CardDescription>{t('dashboard.recentOrdersDesc')}</CardDescription></div>
			<Button variant="outline" size="sm" as={A} href={ROUTES.orders} class="gap-1 text-xs self-start sm:self-auto">{t('dashboard.viewAllOrders')} <IconArrowRight class="size-3.5" /></Button>
          </CardHeader>
          <CardContent>
            <Show when={!recentOrders.error} fallback={
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
                <span>{t('dashboard.loadError')}</span>
                <Button variant="outline" size="sm" onClick={() => refetchRecentOrders()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
              </div>
            }>
              <DataTable>
                <TableHeader><TableRow><TableHead>{t('dashboard.orderId')}</TableHead><TableHead>{t('dashboard.orderEkatalog')}</TableHead><TableHead>{t('dashboard.date')}</TableHead><TableHead>{t('dashboard.customer')}</TableHead><TableHead>{t('dashboard.area')}</TableHead><TableHead class="text-right">{t('dashboard.itemsCol')}</TableHead><TableHead>{t('dashboard.status')}</TableHead></TableRow></TableHeader>
                <TableBody>
                  <Show when={!recentOrders.loading} fallback={<TableSkeleton columns={7} rows={3} />}>
                    <Show when={(recentOrders()?.orders.length ?? 0) > 0} fallback={<TableRow><TableCell colspan={7} class="h-24 text-center text-muted-foreground">{t('dashboard.noOrdersFound')}</TableCell></TableRow>}>
                      <For each={recentOrders()?.orders}>{(order) => <TableRow>
		<TableCell><A href={orderDetailPath(order.id)} class="font-medium text-primary hover:underline">{order.id}</A></TableCell>
                        <TableCell class="font-mono text-xs text-muted-foreground">{order.order_number || order.ecatalog_number || '-'}</TableCell>
                        <TableCell class="text-muted-foreground text-xs">{order.tanggal}</TableCell>
                        <TableCell class="font-medium">{order.customer}</TableCell>
                        <TableCell class="text-muted-foreground text-xs">{order.area}</TableCell>
                        <TableCell class="text-right font-medium tabular-nums">{order.total_items || order.items?.length || 0}</TableCell>
                        <TableCell><Badge status={getDominantOrderStatus(order.items)} kind="order" /></TableCell>
                      </TableRow>}</For>
                    </Show>
                  </Show>
                </TableBody>
              </DataTable>
            </Show>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
};
