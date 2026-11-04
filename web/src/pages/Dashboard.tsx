import { ROUTES, orderDetailPath } from '~/routes';

import { ORDER_STATUS } from '~/domain';

import { type Component, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconArrowRight,
  IconListDetails,
  IconMapPin,
  IconPackage,
  IconRefresh,
  IconUsers,
} from '@tabler/icons-solidjs';
import { getDashboardSummary, getOrderStatusTrend, getOrders } from '~/api';
import { useI18n } from '~/i18n';
import { Badge } from '~/components/Badge';
import { DataTable } from '~/components/DataTable';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { TableSkeleton } from '~/components/TableSkeleton';
import { getDominantOrderStatus } from '~/utils/orderStatus';

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

export const Dashboard: Component = () => {
  const { t, intlLocale } = useI18n();
  const today = isoDay(new Date());
  const [fromDate, setFromDate] = createSignal(addCalendarDays(today, -29));
  const [toDate, setToDate] = createSignal(today);
  const range = createMemo(() => {
    const from = fromDate();
    const to = toDate();
    if (!isValidISODate(from) || !isValidISODate(to) || from > to) return undefined;
    return { from, to };
  });
  const [summary, { refetch: refetchSummary }] = createResource(range, ({ from, to }) => getDashboardSummary({ from, to }));
  const [recentOrders, { refetch: refetchRecentOrders }] = createResource(range, ({ from, to }) => getOrders({ from, to, limit: 5 }));
  const [statusTrend, { refetch: refetchStatusTrend }] = createResource(range, ({ from, to }) => getOrderStatusTrend({ from, to }));

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
  const maxDailyCount = createMemo(() => Math.max(1, ...dailyPoints().map((point) => point.count)));

	const trendSeries = () => [
		{ key: ORDER_STATUS.COMPLETE, label: t('status.selesai'), color: 'var(--color-status-selesai)' },
		{ key: ORDER_STATUS.PROCESSING, label: t('status.proses'), color: 'var(--color-status-proses)' },
		{ key: ORDER_STATUS.UNFINISHED, label: t('status.belumSelesai'), color: 'var(--color-status-belum-selesai)' },
		{ key: ORDER_STATUS.PENDING, label: t('status.pending'), color: 'var(--color-status-pending)' },
		{ key: ORDER_STATUS.CANCELLED, label: t('status.batal'), color: 'var(--color-status-batal)' },
		{ key: 'OTHER', label: t('dashboard.otherStatus'), color: 'var(--color-muted-foreground)' },
	];

  const trendPoints = createMemo(() => (statusTrend()?.points ?? []).map((point) => {
		const counts: Record<string, number> = {
			[ORDER_STATUS.COMPLETE]: 0, [ORDER_STATUS.PROCESSING]: 0, [ORDER_STATUS.UNFINISHED]: 0,
			[ORDER_STATUS.PENDING]: 0, [ORDER_STATUS.CANCELLED]: 0, OTHER: 0,
		};
		for (const [status, count] of Object.entries(point.status_counts ?? {})) {
			const upper = status.trim().toUpperCase();
			const key = upper === 'COMPLETED' ? ORDER_STATUS.COMPLETE
				: upper === 'PARTIAL' ? ORDER_STATUS.PROCESSING
					: upper === ORDER_STATUS.CANCEL ? ORDER_STATUS.CANCELLED
						: upper in counts ? upper : 'OTHER';
			counts[key] += count;
		}
    return { date: point.date.slice(0, 10), counts };
  }));

  const trendMax = createMemo(() => Math.max(1, ...trendPoints().flatMap((point) => Object.values(point.counts))));
  const trendX = (date: string) => {
    const selected = range();
    if (!selected) return 40;
    const span = Math.max(1, dayNumber(selected.to) - dayNumber(selected.from));
    return 40 + ((dayNumber(date) - dayNumber(selected.from)) / span) * 560;
  };
  const trendY = (count: number) => 195 - (count / trendMax()) * 150;
  const trendPaths = (key: string) => {
    const points = trendPoints();
    const paths: string[] = [];
    let current: string[] = [];
    let previousDate = '';
    for (const point of points) {
      if (previousDate && dayNumber(point.date) - dayNumber(previousDate) !== 1) {
        if (current.length > 1) paths.push(current.join(' '));
        current = [];
      }
      current.push(`${current.length === 0 ? 'M' : 'L'} ${trendX(point.date)} ${trendY(point.counts[key])}`);
      previousDate = point.date;
    }
    if (current.length > 1) paths.push(current.join(' '));
    return paths;
  };
  const formatChartDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  };
  const trendAccessibleLabel = (point: { date: string; counts: Record<string, number> }) => {
    const values = trendSeries().map((series) => `${series.label}: ${point.counts[series.key]}`).join(', ');
    const total = Object.values(point.counts).reduce((sum, count) => sum + count, 0);
    return t('dashboard.statusTrendPoint', { date: formatChartDate(point.date), count: total }) + `. ${values}`;
  };

  return (
    <div class="flex flex-1 flex-col gap-6 min-w-0">
      <section class="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="grid w-full gap-3 sm:grid-cols-2 sm:max-w-xl">
          <label class="grid gap-1.5 text-sm font-medium">
            <span>{t('dashboard.dateFrom')}</span>
            <input type="date" value={fromDate()} aria-invalid={!isValidISODate(fromDate()) || (!!toDate() && isValidISODate(toDate()) && fromDate() > toDate())}
              onInput={(event) => setFromDate(event.currentTarget.value)}
              class="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label class="grid gap-1.5 text-sm font-medium">
            <span>{t('dashboard.dateTo')}</span>
            <input type="date" value={toDate()} aria-invalid={!isValidISODate(toDate()) || (!!fromDate() && isValidISODate(fromDate()) && fromDate() > toDate())}
              onInput={(event) => setToDate(event.currentTarget.value)}
              class="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        </div>
        <Show when={!range()}>
          <p class="text-sm text-destructive" role="alert">{t('dashboard.invalidRange')}</p>
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
            <Card>
              <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.totalOrders')}</CardTitle><IconPackage class="size-4 text-muted-foreground" /></CardHeader>
              <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.total_orders.toLocaleString() ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.totalOrdersDesc')}</p></Show></CardContent>
            </Card>
            <Card>
              <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.totalLineItems')}</CardTitle><IconListDetails class="size-4 text-muted-foreground" /></CardHeader>
              <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.total_items.toLocaleString() ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.totalLineItemsDesc')}</p></Show></CardContent>
            </Card>
            <Card>
              <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.uniqueCustomers')}</CardTitle><IconUsers class="size-4 text-muted-foreground" /></CardHeader>
              <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.unique_customers.toLocaleString() ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.uniqueCustomersDesc')}</p></Show></CardContent>
            </Card>
            <Card>
              <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.coverageAreas')}</CardTitle><IconMapPin class="size-4 text-muted-foreground" /></CardHeader>
              <CardContent><Show when={!summary.loading} fallback={<Skeleton class="h-8 w-24" />}><div class="text-2xl font-bold tabular-nums">{summary()?.unique_areas.toLocaleString() ?? '0'}</div><p class="mt-1 text-xs text-muted-foreground">{t('dashboard.coverageAreasDesc')}</p></Show></CardContent>
            </Card>
          </div>

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
              <CardHeader><CardTitle class="text-base font-semibold">{t('dashboard.dailyOrders')}</CardTitle><CardDescription>{t('dashboard.dailyOrdersDesc')}</CardDescription></CardHeader>
              <CardContent>
                <Show when={!summary.loading} fallback={<Skeleton class="h-56 w-full" />}>
                  <Show when={dailyPoints().some((point) => point.count > 0)} fallback={<p class="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noDailyOrders')}</p>}>
                    <div class="overflow-x-auto pb-2">
                      <div class="flex h-56 items-end gap-1 border-b border-l px-2" role="img" aria-label={t('dashboard.dailyOrdersDesc')} style={{ width: `${Math.max(560, dailyPoints().length * 30)}px` }}>
                        <For each={dailyPoints()}>{(point, index) => {
                          const showLabel = index() === 0 || index() === dailyPoints().length - 1 || index() % 7 === 0;
                          const height = point.count === 0 ? 2 : Math.max(5, (point.count / maxDailyCount()) * 170);
                          return (
                            <div class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={t('dashboard.dailyOrdersPoint', { date: formatChartDate(point.date), count: point.count })}>
                              <span class="text-[10px] tabular-nums text-muted-foreground">{point.count || ''}</span>
                              <div class="w-full max-w-5 rounded-t-sm bg-primary" style={{ height: `${height}px`, opacity: point.count ? 1 : 0.18 }} />
                              <span class="h-4 whitespace-nowrap text-[10px] text-muted-foreground">{showLabel ? formatChartDate(point.date) : ''}</span>
                            </div>
                          );
                        }}</For>
                      </div>
                    </div>
                    <ul class="sr-only"><For each={dailyPoints()}>{(point) => <li>{t('dashboard.dailyOrdersPoint', { date: formatChartDate(point.date), count: point.count })}</li>}</For></ul>
                  </Show>
                </Show>
              </CardContent>
            </Card>
          </div>
        </Show>

        <Card class="min-w-0">
          <CardHeader><CardTitle class="text-base font-semibold">{t('dashboard.statusTrend')}</CardTitle><CardDescription>{t('dashboard.statusTrendDesc')}</CardDescription></CardHeader>
          <CardContent>
            <Show when={!statusTrend.error} fallback={
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
                <span>{t('dashboard.loadError')}</span>
                <Button variant="outline" size="sm" onClick={() => refetchStatusTrend()}><IconRefresh class="size-4" />{t('common.retry')}</Button>
              </div>
            }>
              <Show when={!statusTrend.loading} fallback={<Skeleton class="h-64 w-full" />}>
                <Show when={trendPoints().length > 0} fallback={<p class="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noStatusHistory')}</p>}>
                  <div class="overflow-x-auto">
                    <svg viewBox="0 0 640 245" class="min-w-[560px] w-full" role="img" aria-label={t('dashboard.statusTrend')}>
                      <line x1="40" y1="195" x2="600" y2="195" class="stroke-border" />
                      <line x1="40" y1="45" x2="40" y2="195" class="stroke-border" />
                      <For each={trendSeries()}>{(series) => <For each={trendPaths(series.key)}>{(path) => <path d={path} fill="none" stroke={`var(${series.color.slice(4, -1)})`} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />}</For>}</For>
                      <For each={trendPoints()}>{(point) => <For each={trendSeries()}>{(series) => <circle cx={trendX(point.date)} cy={trendY(point.counts[series.key])} r="3" fill={`var(${series.color.slice(4, -1)})`} />}</For>}</For>
                      <For each={trendPoints()}>{(point, index) => {
                        const showLabel = index() === 0 || index() === trendPoints().length - 1 || index() % Math.max(1, Math.ceil(trendPoints().length / 5)) === 0;
                        return showLabel ? <text x={trendX(point.date)} y="222" text-anchor="middle" class="fill-muted-foreground text-[10px]">{formatChartDate(point.date)}</text> : null;
                      }}</For>
                    </svg>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <For each={trendSeries()}>{(series) => <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span class="size-2 rounded-full" style={{ 'background-color': `var(${series.color.slice(4, -1)})` }} />{series.label}</span>}</For>
                  </div>
                  <div class="sr-only focus-within:not-sr-only">
                    <p>{t('dashboard.statusTrend')}</p>
                    <ul><For each={trendPoints()}>{(point) => <li><button type="button" class="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{trendAccessibleLabel(point)}</button></li>}</For></ul>
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
