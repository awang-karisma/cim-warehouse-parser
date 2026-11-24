import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import {
  IconChartLine,
  IconDatabase,
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
export default function Datalogger() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionsData, { refetch }] = createResource(() => getDataloggerSessions());
  const device = createDataloggerDeviceSession();

  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);
  const [loadedIds, setLoadedIds] = createSignal<number[]>([]);
  const [loadedRecords, setLoadedRecords] = createSignal<Record<string, DataloggerRecord[]>>({});
  const [loadingBatch, setLoadingBatch] = createSignal(false);

  const activeTab = () => {
    const tab = searchParams.tab;
    return tab === 'graph' || tab === 'import' || tab === 'config' ? tab : 'sessions';
  };

  const setTab = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
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
      const res = await getDataloggerRecordsBatch(ids);
      setLoadedIds(ids);
      setLoadedRecords(res.records);
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
      const res = await getDataloggerRecordsBatch([session.id]);
      setLoadedIds([session.id]);
      setLoadedRecords(res.records);
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
            <TabsList class="w-full justify-start overflow-x-auto sm:w-auto">
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
                <Show when={loadedIds().length > 0}>
                  <Badge variant="default" class="ml-1 font-mono text-[10px] tabular-nums">
                    {loadedIds().length}
                  </Badge>
                </Show>
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
