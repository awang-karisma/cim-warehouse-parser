import { DELIVERY_RUN_STATUS, LOCALE, WEEKDAY_NAME } from '~/domain';
import { captureEvent, captureException } from '~/posthog';

import { type Component, createSignal, createResource, createEffect, Show, For } from 'solid-js';
import { useI18n } from '~/i18n';
import {
  IconDeviceDesktop,
  IconSettings as IconSettingsIcon,
  IconDatabase,
  IconTool,
  IconRefresh,
  IconTrash,
  IconSun,
  IconMoon,
  IconCalendar,
  IconCheck,
  IconAlertCircle,
  IconMap,
} from '@tabler/icons-solidjs';
import { useColorMode } from '@kobalte/core';
import { useAuth } from '~/auth';
import {
  getSystemInfo,
  getConfig,
  getStatus,
  triggerSync,
  clearDatabase,
  invalidateMapTileCache,
  getWorkdayPolicies,
  setWorkdayPolicy,
} from '../api';
import { bumpMapTileCacheBust } from '~/components/mapStyles';
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
import { Badge as UiBadge } from '~/components/ui/badge';
import { TableSkeleton } from '~/components/TableSkeleton';
import { AccurateSettings } from '~/components/AccurateSettings';
export const Settings: Component = () => {
  const { t, locale, setLocale } = useI18n();
  const { colorMode, setColorMode } = useColorMode();
  const auth = useAuth();
  const [system] = createResource(() => auth.can('system:read'), getSystemInfo);
  const [config, { refetch: refetchConfig }] = createResource(() => auth.can('system:read'), getConfig);
  const canSeeStatus = () => auth.can('system:read') && auth.can('sync:read');
  const [status, { refetch: refetchStatus }] = createResource(canSeeStatus, getStatus);
  const [showClearDbDialog, setShowClearDbDialog] = createSignal(false);
  const [isClearingDb, setIsClearingDb] = createSignal(false);
  const [clearDbMsg, setClearDbMsg] = createSignal<string | null>(null);
  const [clearDbError, setClearDbError] = createSignal<string | null>(null);


  const [policiesData, { refetch: refetchPolicies }] = createResource(() => auth.can('workday:read'), getWorkdayPolicies);
	const ALL_WEEKDAYS: string[] = [WEEKDAY_NAME.MONDAY, WEEKDAY_NAME.TUESDAY, WEEKDAY_NAME.WEDNESDAY, WEEKDAY_NAME.THURSDAY, WEEKDAY_NAME.FRIDAY, WEEKDAY_NAME.SATURDAY, WEEKDAY_NAME.SUNDAY];
	const [selectedDays, setSelectedDays] = createSignal<string[]>([]);
	const [isSavingPolicy, setIsSavingPolicy] = createSignal(false);
	const [policySaveError, setPolicySaveError] = createSignal<string | null>(null);
	const [policySaveSuccess, setPolicySaveSuccess] = createSignal<string | null>(null);
	const weekdayName = (day: string) => {
		switch (day) {
		case WEEKDAY_NAME.MONDAY: return t('settings.monday');
		case WEEKDAY_NAME.TUESDAY: return t('settings.tuesday');
		case WEEKDAY_NAME.WEDNESDAY: return t('settings.wednesday');
		case WEEKDAY_NAME.THURSDAY: return t('settings.thursday');
		case WEEKDAY_NAME.FRIDAY: return t('settings.friday');
		case WEEKDAY_NAME.SATURDAY: return t('settings.saturday');
		case WEEKDAY_NAME.SUNDAY: return t('settings.sunday');
		default: return day;
		}
	};
  createEffect(() => {
    const list = policiesData()?.policies;
    if (list && list.length > 0) {
      setSelectedDays([...list[list.length - 1].work_days]);
    }
  });

  const canEditLeadTime = () => auth.can('workday:update');

  const toggleWeekday = (day: string) => {
    if (!canEditLeadTime() || isSavingPolicy()) return;
    const current = selectedDays();
    if (current.includes(day)) {
      if (current.length === 1) return;
      setSelectedDays(current.filter((d) => d !== day));
    } else {
      setSelectedDays([...current, day].sort((a, b) => ALL_WEEKDAYS.indexOf(a) - ALL_WEEKDAYS.indexOf(b)));
    }
  };

  const handleSavePolicy = async () => {
    if (!canEditLeadTime() || isSavingPolicy() || selectedDays().length === 0) return;
    setIsSavingPolicy(true);
    setPolicySaveError(null);
    setPolicySaveSuccess(null);
    try {
      const res = await setWorkdayPolicy(selectedDays());
      captureEvent('lead_time_policy_saved', {
        workday_count: selectedDays().length,
      });
      if (auth.can('workday:read')) await refetchPolicies();
      setPolicySaveSuccess(t('settings.workdaysSavedSuccess', { date: res.policy.effective_from }));
    } catch (err: unknown) {
      captureException(err, { source: 'lead_time_policy' });
      setPolicySaveError(err instanceof Error ? err.message : t('settings.workdaysSaveError'));
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const [resyncing, setResyncing] = createSignal(false);
  const [resyncMsg, setResyncMsg] = createSignal('');

  const handleForceResync = async () => {
    if (!auth.can('sync:trigger') || resyncing()) return;
    setResyncing(true);
    setResyncMsg(t('settings.triggeringResync'));
    try {
      const res = await triggerSync();
      setResyncMsg(t('settings.resyncFinished', { msg: res.message || 'Success' }));
      if (canSeeStatus()) void refetchStatus();
    } catch (err: unknown) {
      setResyncMsg(err instanceof Error ? err.message : t('settings.resyncError'));
    } finally {
      setResyncing(false);
    }
  };

  const [invalidatingTiles, setInvalidatingTiles] = createSignal(false);
  const [tileInvalidateMsg, setTileInvalidateMsg] = createSignal<string | null>(null);
  const [tileInvalidateError, setTileInvalidateError] = createSignal<string | null>(null);

  const handleInvalidateMapTiles = async () => {
    if (!auth.can('system:read') || invalidatingTiles()) return;
    setInvalidatingTiles(true);
    setTileInvalidateMsg(null);
    setTileInvalidateError(null);
    try {
      const res = await invalidateMapTileCache();
      bumpMapTileCacheBust(res.invalidated_at);
      void refetchConfig();
      setTileInvalidateMsg(t('settings.mapTilesInvalidatedSuccess', { time: res.invalidated_at }));
    } catch (err: unknown) {
      setTileInvalidateError(err instanceof Error ? err.message : t('settings.mapTilesInvalidateError'));
    } finally {
      setInvalidatingTiles(false);
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
            <CardTitle class="text-base font-semibold">{t('settings.themeCard')}</CardTitle>
            <CardDescription>{t('settings.themeCardDesc')}</CardDescription>
          </div>
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              variant={colorMode() === 'light' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('light')}
            >
              <IconSun class="size-3.5" />
              <span>{t('theme.light')}</span>
            </Button>
            <Button
              variant={colorMode() === 'dark' ? 'default' : 'outline'}
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('dark')}
            >
              <IconMoon class="size-3.5" />
              <span>{t('theme.dark')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
              onClick={() => setColorMode('system')}
            >
              <IconDeviceDesktop class="size-3.5" />
              <span>{t('theme.system')}</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Language / Bahasa Card */}
      <Card>
        <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle class="text-base font-semibold">{t('language.label')}</CardTitle>
            <CardDescription>{t('language.description')}</CardDescription>
          </div>
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
				variant={locale() === LOCALE.ENGLISH ? 'default' : 'outline'}
				size="sm"
				class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
				onClick={() => setLocale(LOCALE.ENGLISH)}
            >
              <span>English</span>
            </Button>
            <Button
				variant={locale() === LOCALE.INDONESIAN ? 'default' : 'outline'}
				size="sm"
				class="gap-1.5 text-xs h-8 flex-1 sm:flex-initial"
				onClick={() => setLocale(LOCALE.INDONESIAN)}
            >
              <span>Bahasa Indonesia</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* 2-Column: Server Runtime + Sync Config */}
      <Show when={auth.can('system:read')}>
      <div class="grid gap-6 lg:grid-cols-2 items-stretch">
        {/* Server Runtime Info Card */}
        <Card class="flex flex-col justify-between">
          <div>
            <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
              <IconDeviceDesktop class="size-5 text-primary" />
              <div>
                <CardTitle class="text-base font-semibold">{t('settings.serverInfo')}</CardTitle>
                <CardDescription>{t('settings.serverInfoDesc')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.appVersion')}</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span class="font-semibold">{system()?.version || 'v1.0.0'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.goRuntime')}</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-24" />}>
                  <span class="font-semibold">{system()?.go_version || '-'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.httpPort')}</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-16" />}>
                  <span class="font-semibold">:{system()?.port || '8080'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.dbPath')}</span>
                <Show when={!system.loading} fallback={<Skeleton class="h-5 w-32" />}>
                  <span class="font-mono text-xs font-semibold">
                    {system()?.db_path || 'data/warehouse.db'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.serverUptime')}</span>
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
                <CardTitle class="text-base font-semibold">{t('settings.dataSource')}</CardTitle>
                <CardDescription>{t('settings.dataSourceDesc')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.syncInterval')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-16" />}>
                  <span class="font-semibold">{config()?.sync_interval || '15m'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.workingHours')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-28" />}>
                  <span class="font-semibold">
                    {config()?.work_hours_start || '08:00'} – {config()?.work_hours_end || '17:00'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.timezone')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-28" />}>
                  <span class="font-semibold">{config()?.timezone || 'Asia/Makassar'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.activeWorkDays')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-32" />}>
                  <span class="font-semibold">
                    {config()?.work_days ? config()!.work_days.join(', ') : t('settings.defaultWorkDays')}
                  </span>
                </Show>
              </div>
              <Show when={auth.can('sync:read')}>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.workerStatus')}</span>
                <Show when={!status.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span>
                    <Badge status={status()?.status || 'IDLE'} />
                  </span>
                </Show>
              </div>
              </Show>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1 gap-4">
                <span class="text-xs text-muted-foreground">{t('settings.mapTileCacheDir')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-28" />}>
                  <span class="font-mono text-xs font-semibold truncate">
                    {config()?.map_tile_cache_dir || 'data/maptiles'}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.mapTileCacheTtl')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span class="font-semibold">{config()?.map_tile_cache_ttl || '720h0m0s'}</span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1">
                <span class="text-xs text-muted-foreground">{t('settings.mapTileCacheMaxSize')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-20" />}>
                  <span class="font-semibold">
                    {(config()?.map_tile_cache_max_size_mb ?? 512) > 0
                      ? `${config()?.map_tile_cache_max_size_mb ?? 512} MB`
                      : t('settings.unlimited')}
                  </span>
                </Show>
              </div>
              <Separator />
              <div class="flex justify-between items-center text-sm py-1 gap-4">
                <span class="text-xs text-muted-foreground">{t('settings.mapProviderKeys')}</span>
                <Show when={!config.loading} fallback={<Skeleton class="h-5 w-32" />}>
                  <div class="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                    <span class={config()?.map_carto_api_key_configured ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                      CARTO: {config()?.map_carto_api_key_configured ? t('settings.configured') : t('settings.notSet')}
                    </span>
                    <span class="text-muted-foreground">·</span>
                    <span class={config()?.map_osm_api_key_configured ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                      OSM: {config()?.map_osm_api_key_configured ? t('settings.configured') : t('settings.notSet')}
                    </span>
                    <span class="text-muted-foreground">·</span>
                    <span class={config()?.map_esri_api_key_configured ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                      Esri: {config()?.map_esri_api_key_configured ? t('settings.configured') : t('settings.notSet')}
                    </span>
                  </div>
                </Show>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>
      </Show>

      {/* Lead Time Workdays Policy Card */}
      <Show when={auth.canAny('workday:read', 'workday:update')}>
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconCalendar class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">{t('settings.leadTimeWorkdays')}</CardTitle>
            <CardDescription>
              {t(auth.can('workday:read') ? 'settings.leadTimeWorkdaysDesc' : 'settings.replaceWorkdaysDesc')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('settings.configuredWorkdays')}
              </span>
              <Show when={!canEditLeadTime()}>
                <span class="text-xs text-muted-foreground">{t('roleManagement.readOnly')}</span>
              </Show>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <For each={ALL_WEEKDAYS}>
                {(day) => {
                  const isSelected = () => selectedDays().includes(day);
                  return (
                    <Button
                      type="button"
                      variant={isSelected() ? 'default' : 'outline'}
                      size="sm"
                      class="h-9 justify-center text-xs font-medium"
                      disabled={!canEditLeadTime() || isSavingPolicy()}
                      onClick={() => toggleWeekday(day)}
                    >
                      <Show when={isSelected()}>
                        <IconCheck class="size-3.5 mr-1 text-primary-foreground" />
                      </Show>
                      <span>{weekdayName(day)}</span>
                    </Button>
                  );
                }}
              </For>
            </div>
            <Show when={canEditLeadTime()}>
              <div class="flex items-center justify-between pt-2">
                <span class="text-xs text-muted-foreground">
                  {t('settings.selectedDaysCount', { count: selectedDays().length })}
                </span>
                <Button
                  size="sm"
                  class="gap-1.5"
                  disabled={isSavingPolicy() || selectedDays().length === 0}
                  onClick={handleSavePolicy}
                >
                  <Show when={isSavingPolicy()}>
                    <IconRefresh class="size-3.5 animate-spin" />
                  </Show>
                  <span>{isSavingPolicy() ? t('common.saving') : t('settings.saveWorkdaySchedule')}</span>
                </Button>
              </div>
            </Show>
          </div>

          <Show when={policySaveSuccess()}>
            <div class="flex items-center gap-2 p-3 text-xs rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <IconCheck class="size-4 shrink-0" />
              <span>{policySaveSuccess()}</span>
            </div>
          </Show>

          <Show when={policySaveError()}>
            <div class="flex items-center gap-2 p-3 text-xs rounded-md bg-destructive/15 text-destructive border border-destructive/20">
              <IconAlertCircle class="size-4 shrink-0" />
              <span>{policySaveError()}</span>
            </div>
          </Show>

          <Show when={auth.can('workday:read')}>
          <div class="space-y-3 pt-2">
            <div>
              <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('settings.scheduleHistory')}
              </h4>
              <p class="text-xs text-muted-foreground mt-0.5">
                {t('settings.scheduleHistoryDesc')}
              </p>
            </div>
            <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.effectiveFrom')}</TableHead>
                  <TableHead>{t('settings.activeWorkdaysCol')}</TableHead>
                  <TableHead class="text-right">{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={!policiesData.loading && policiesData()?.policies}
                  fallback={<TableSkeleton columns={3} rows={2} />}
                >
                  <For each={policiesData()!.policies}>
                    {(policy, index) => {
                      const isLatest = () => index() === policiesData()!.policies.length - 1;
                      return (
                        <TableRow>
                          <TableCell class="font-mono text-xs font-semibold">
                            {policy.effective_from === '0001-01-01' ? `0001-01-01 ${t('settings.baselineSchedule')}` : policy.effective_from}
                          </TableCell>
                          <TableCell class="text-xs font-medium text-foreground">
                            {policy.work_days.join(', ')}
                          </TableCell>
                          <TableCell class="text-right">
                            <UiBadge variant={isLatest() ? 'default' : 'outline'}>
                              {isLatest() ? t('settings.currentSchedule') : t('settings.historicalSchedule')}
                            </UiBadge>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </For>
                </Show>
              </TableBody>
            </DataTable>
          </div>
          </Show>
        </CardContent>
      </Card>
      </Show>

      <Show when={auth.canAny('accurate:read', 'accurate:create', 'accurate:delete')}>
        <AccurateSettings />
      </Show>

      {/* Database Diagnostics Table Card */}
      <Show when={auth.can('system:read')}>
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconDatabase class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">{t('settings.dbDiagnosticsTitle')}</CardTitle>
            <CardDescription>{t('settings.dbDiagnosticsDesc')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.tableName')}</TableHead>
                  <TableHead class="text-right">{t('settings.rowCount')}</TableHead>
                  <TableHead>{t('settings.storageEngine')}</TableHead>
                  <TableHead class="text-right">{t('common.status')}</TableHead>
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
                        <TableCell class="text-right font-medium">{stat.row_count.toLocaleString()} {t('settings.rowsUnit')}</TableCell>
                        <TableCell class="text-xs text-muted-foreground">SQLite 3 (WAL mode)</TableCell>
                        <TableCell class="text-right">
							<Badge status={DELIVERY_RUN_STATUS.READY} />
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </Show>
              </TableBody>
          </DataTable>
        </CardContent>
      </Card>
      </Show>

      {/* Maintenance Operations Card */}
      <Show when={auth.canAny('sync:trigger', 'database:clear', 'system:read')}>
      <Card>
        <CardHeader class="flex flex-row items-center gap-2 space-y-0 pb-4">
          <IconTool class="size-5 text-primary" />
          <div>
            <CardTitle class="text-base font-semibold">{t('settings.dbMaintenance')}</CardTitle>
            <CardDescription>{t('settings.dbMaintenanceDesc')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={auth.can('sync:trigger')}>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border bg-muted/20">
            <div>
              <h4 class="text-sm font-semibold">{t('settings.forceResyncTitle')}</h4>
              <p class="text-xs text-muted-foreground mt-1">
                {t('settings.forceResyncDesc')}
              </p>
            </div>
            <Button
              size="sm"
              class="gap-1.5"
              disabled={resyncing()}
              onClick={handleForceResync}
            >
              <IconRefresh class={`size-4 ${resyncing() ? 'animate-spin' : ''}`} />
              <span>{resyncing() ? t('sync.syncing') : t('settings.forceResyncBtn')}</span>
            </Button>
          </div>
          </Show>

          <Show when={resyncMsg()}>
            <div class="p-3 rounded-md bg-muted text-xs font-medium">
              {resyncMsg()}
            </div>
          </Show>

          <Show when={auth.can('system:read')}>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border bg-muted/20">
              <div>
                <h4 class="text-sm font-semibold">{t('settings.invalidateMapTilesTitle')}</h4>
                <p class="text-xs text-muted-foreground mt-1">
                  {t('settings.invalidateMapTilesDesc')}
                </p>
                <Show when={tileInvalidateMsg()}>
                  <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2">
                    {tileInvalidateMsg()}
                  </p>
                </Show>
                <Show when={tileInvalidateError()}>
                  <p class="text-xs font-medium text-destructive mt-2">
                    {tileInvalidateError()}
                  </p>
                </Show>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="gap-1.5 shrink-0"
                disabled={invalidatingTiles()}
                onClick={handleInvalidateMapTiles}
              >
                <IconMap class={`size-4 ${invalidatingTiles() ? 'animate-pulse' : ''}`} />
                <span>
                  {invalidatingTiles()
                    ? t('settings.invalidatingMapTiles')
                    : t('settings.invalidateMapTilesBtn')}
                </span>
              </Button>
            </div>
          </Show>

          <Show when={auth.can('database:clear')}>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
              <div>
                <h4 class="text-sm font-semibold text-destructive">{t('settings.clearDbTitle')}</h4>
                <p class="text-xs text-muted-foreground mt-1">
                  {t('settings.clearDbDesc')}
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
                {t('settings.wipeDatabase')}
              </Button>
            </div>
          </Show>
        </CardContent>
      </Card>
      </Show>

      {/* Clear Database Alert Dialog */}
      <AlertDialog
        open={auth.can('database:clear') && showClearDbDialog()}
        onOpenChange={(open) => {
          if (!open) setShowClearDbDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('settings.clearDbConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.clearDbConfirmDesc')}
          </AlertDialogDescription>
          <div class="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowClearDbDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isClearingDb()}
              onClick={async () => {
                if (!auth.can('database:clear') || isClearingDb()) return;
                setIsClearingDb(true);
                setClearDbMsg(null);
                setClearDbError(null);
                try {
                  await clearDatabase();
                  setClearDbMsg(t('settings.clearDbSuccess'));
                  setShowClearDbDialog(false);
                  if (canSeeStatus()) void refetchStatus();
                } catch (err: unknown) {
                  setClearDbError(err instanceof Error ? err.message : t('settings.clearDbError'));
                } finally {
                  setIsClearingDb(false);
                }
              }}
            >
              {isClearingDb() ? t('settings.clearing') : t('settings.clearAllData')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
