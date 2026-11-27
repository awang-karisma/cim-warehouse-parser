import { createEffect, createMemo, createResource, createSignal, lazy, Show, Suspense } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import {
  IconChartLine,
  IconDatabase,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-solidjs';
import { getDataloggerRecordsBatch, getDataloggerSessions } from '~/api';
import { createDataloggerDeviceSession } from '~/components/datalogger/device-session';
import { PageTransition } from '~/components/PageTransition';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { useI18n } from '~/i18n';
import { cn } from '~/lib/utils';
import type { DataloggerRecord, DataloggerSession } from '~/types';
import { ConfigurationTab } from './ConfigurationTab';
import { GraphTab } from './GraphTab';
import { ImportTab } from './ImportTab';
import { KpiCards } from './KpiCards';
import { SessionsTab } from './SessionsTab';

const ThermalMapTab = lazy(() => import('./ThermalMapTab'));

export default function Datalogger() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionsData, { refetch }] = createResource(() => getDataloggerSessions());
  const device = createDataloggerDeviceSession();

  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);
  const [loadedIds, setLoadedIds] = createSignal<number[]>([]);
  const [loadedRecords, setLoadedRecords] = createSignal<Record<string, DataloggerRecord[]>>({});
  const [loadingBatch, setLoadingBatch] = createSignal(false);
  const pendingRecords = new Map<number, Promise<void>>();

  async function loadRecords(ids: readonly number[]) {
    const missing = ids.filter((id) => !Object.hasOwn(loadedRecords(), id) && !pendingRecords.has(id));
    if (missing.length) {
      const request = getDataloggerRecordsBatch(missing).then(({ records }) => {
        setLoadedRecords((current) => ({ ...current, ...Object.fromEntries(missing.map((id) => [id, records[String(id)] ?? []])) }));
      }).finally(() => { for (const id of missing) pendingRecords.delete(id); });
      for (const id of missing) pendingRecords.set(id, request);
    }
    await Promise.all(ids.map((id) => pendingRecords.get(id)));
  }

  const activeTab = () => {
    const tab = searchParams.tab;
    return tab === 'graph' || tab === 'thermal' || tab === 'import' || tab === 'config' ? tab : 'sessions';
  };
  const [thermalVisited, setThermalVisited] = createSignal(activeTab() === 'thermal');
  createEffect(() => { if (activeTab() === 'thermal') setThermalVisited(true); });

  const setTab = (value: string) => {
    setSearchParams({ tab: value, sessions: undefined }, { replace: true });
  };

  const sessions = () => sessionsData()?.sessions ?? [];

  const loadedSessions = createMemo(() => {
    const idSet = new Set(loadedIds());
    return sessions().filter((s) => idSet.has(s.id));
  });

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleLoadSelected = async () => {
    const ids = selectedIds();
    if (ids.length === 0) return;
    setLoadingBatch(true);
    try {
      await loadRecords(ids);
      setLoadedIds(ids);
      // Automatically switch to the Graph tab without scrolling!
      setTab('graph');
    } finally {
      setLoadingBatch(false);
    }
  };

  const handleRemoveLoadedSession = (id: number) => {
    setLoadedIds((prev) => prev.filter((x) => x !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleClearAllLoaded = () => {
    setLoadedIds([]);
    setSelectedIds([]);
  };

  const handleSessionSaved = async (session: DataloggerSession) => {
    await refetch();
    setSelectedIds([session.id]);
    setLoadingBatch(true);
    try {
      await loadRecords([session.id]);
      setLoadedIds([session.id]);
      setTab('graph');
    } catch {
      setTab('sessions');
    } finally {
      setLoadingBatch(false);
    }
  };

  return (
    <PageTransition>
      <div class="w-full space-y-4 p-3.5 sm:p-4 md:p-6 min-w-0">
        {/* Dashboard View On Top: Always-visible KPI Cards without top banner text */}
        <KpiCards sessions={sessions()} />

        {/* Tabs with Refresh Button placed INLINE */}
        <Tabs value={activeTab()} onChange={setTab}>
          <div class="flex flex-wrap items-center justify-between gap-2.5">
            <TabsList class="h-auto w-full flex-wrap justify-start sm:w-auto">
              <TabsTrigger value="sessions" class="gap-1.5 text-xs sm:text-sm">
                <IconDatabase class="size-4" />
                <span>{t('datalogger.tabs.sessions')}</span>
                <Badge variant="secondary" class="ml-1 font-mono text-[10px] tabular-nums">
                  {sessions().length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="graph" class="gap-1.5 text-xs sm:text-sm">
                <IconChartLine class="size-4" />
                <span>{t('datalogger.tabs.graph')}</span>
              </TabsTrigger>
              <TabsTrigger value="thermal" class="gap-1.5 text-xs sm:text-sm">
                <IconMap2 class="size-4" aria-hidden="true" />
                <span>{t('datalogger.tabs.thermal')}</span>
              </TabsTrigger>
              <TabsTrigger value="import" class="gap-1.5 text-xs sm:text-sm">
                <IconPlus class="size-4" />
                <span>{t('datalogger.tabs.import')}</span>
              </TabsTrigger>
              <TabsTrigger value="config" class="gap-1.5 text-xs sm:text-sm">
                <IconSettings class="size-4" />
                <span>{t('datalogger.tabs.config')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Refresh button inline with the tabs */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              class="h-9 gap-1.5 text-xs shrink-0 self-end sm:self-auto"
              title={t('datalogger.refreshTitle')}
            >
              <IconRefresh class="size-3.5" />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>

          <TabsContent value="sessions" class="mt-3">
            <SessionsTab
              sessions={sessions()}
              loading={sessionsData.loading}
              selectedIds={selectedIds()}
              loadingBatch={loadingBatch()}
              onToggleSelect={handleToggleSelect}
              onSelectAll={(ids) => setSelectedIds(ids)}
              onClearSelection={() => setSelectedIds([])}
              onLoadSelected={handleLoadSelected}
              onMutated={() => refetch()}
              onGoToImport={() => setTab('import')}
            />
          </TabsContent>

          <TabsContent value="graph" class="mt-3">
            <GraphTab
              loadedSessions={loadedSessions()}
              recordsBySession={loadedRecords()}
              onRemoveSession={handleRemoveLoadedSession}
              onGoToSessions={() => setTab('sessions')}
              onClearAllLoaded={handleClearAllLoaded}
            />
          </TabsContent>

          <TabsContent value="thermal" forceMount class={cn('mt-3', activeTab() !== 'thermal' && 'hidden')}>
            <Show when={thermalVisited()}>
              <Suspense fallback={<p class="text-sm text-muted-foreground" role="status">{t('thermal.loadingMap')}</p>}>
                <ThermalMapTab active={activeTab() === 'thermal'}
                  sessions={typeof searchParams.sessions === 'string' ? searchParams.sessions : ''}
                  loadedIds={loadedIds()} records={loadedRecords()} loadRecords={loadRecords}
                  onGoToImport={() => setTab('import')} />
              </Suspense>
            </Show>
          </TabsContent>

          <TabsContent
            value="import"
            forceMount
            class={cn('mt-3', activeTab() !== 'import' && 'hidden')}
          >
            <ImportTab device={device} onSessionSaved={handleSessionSaved} />
          </TabsContent>

          <TabsContent
            value="config"
            forceMount
            class={cn('mt-3', activeTab() !== 'config' && 'hidden')}
          >
            <ConfigurationTab
              device={device}
              active={activeTab() === 'config'}
              onSwitchToImport={() => setTab('import')}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
