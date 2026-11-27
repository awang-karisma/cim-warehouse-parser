import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
  IconAlertCircle,
  IconChartLine,
  IconCheck,
  IconDatabase,
  IconEdit,
  IconLoader2,
  IconTrash,
  IconX,
} from '@tabler/icons-solidjs';
import { deleteDataloggerSession, renameDataloggerSession } from '~/api';
import { DataTable } from '~/components/DataTable';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { dataloggerRecordsPath } from '~/routes';
import { useI18n } from '~/i18n';
import type { DataloggerSession } from '~/types';
import {
  formatDateTimeShort,
  formatRelativeAgo,
} from '~/components/datalogger/format';
import { PaginationControls } from '~/components/datalogger/PaginationControls';
import {
  createEmptyDateFilter,
  filterSessionsInclusive,
  type SessionDateFilterState,
} from '~/components/datalogger/session-filter';
import { SessionFilterBar } from '~/components/datalogger/SessionFilterBar';

interface SessionsTabProps {
  sessions: DataloggerSession[];
  loading: boolean;
  selectedIds: number[];
  loadingBatch: boolean;
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onClearSelection: () => void;
  onLoadSelected: () => void;
  onMutated: () => void;
  onGoToImport: () => void;
}

export function SessionsTab(props: SessionsTabProps) {
  const { t } = useI18n();
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  // Filter & Pagination state
  const [filter, setFilter] = createSignal<SessionDateFilterState>(createEmptyDateFilter());
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(10);

  // Inline rename state
  const [renamingId, setRenamingId] = createSignal<number | null>(null);
  const [renameDraft, setRenameDraft] = createSignal('');
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const filteredSessions = createMemo(() => filterSessionsInclusive(props.sessions, filter()));

  createEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredSessions().length / Math.max(1, pageSize())));
    if (page() > maxPage) setPage(maxPage);
  });

  const paginatedSessions = createMemo(() => {
    const start = (page() - 1) * pageSize();
    return filteredSessions().slice(start, start + pageSize());
  });

  const allOnPageSelected = createMemo(() => {
    const rows = paginatedSessions();
    return rows.length > 0 && rows.every((s) => props.selectedIds.includes(s.id));
  });

  const handleToggleAllOnPage = (checked: boolean) => {
    const pageIds = paginatedSessions().map((s) => s.id);
    if (checked) {
      const merged = Array.from(new Set([...props.selectedIds, ...pageIds]));
      props.onSelectAll(merged);
    } else {
      const pageSet = new Set(pageIds);
      props.onSelectAll(props.selectedIds.filter((id) => !pageSet.has(id)));
    }
  };

  const handleRenameSubmit = async (id: number) => {
    const next = renameDraft().trim();
    if (!next) return;
    setErrorMsg(null);
    setBusyId(id);
    try {
      await renameDataloggerSession(id, next);
      setRenamingId(null);
      props.onMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (session: DataloggerSession) => {
    if (
      !window.confirm(
        t('datalogger.sessions.deleteConfirm', {
          name: session.name,
          count: session.record_count.toLocaleString(),
        }),
      )
    ) {
      return;
    }
    setErrorMsg(null);
    setBusyId(session.id);
    try {
      await deleteDataloggerSession(session.id);
      props.onMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="space-y-4">
      <Show when={errorMsg()}>
        <Alert variant="destructive">
          <IconAlertCircle class="size-4" />
          <AlertTitle>{t('datalogger.sessions.actionFailed')}</AlertTitle>
          <AlertDescription>{errorMsg()}</AlertDescription>
        </Alert>
      </Show>

      <Card>
        <CardHeader class="space-y-4 pb-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-1">
              <CardTitle>{t('datalogger.sessions.title')}</CardTitle>
              <CardDescription>
                {t('datalogger.sessions.description')}
              </CardDescription>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Show when={props.selectedIds.length > 0}>
                <Button variant="outline" size="sm" onClick={props.onClearSelection} class="h-8 text-xs">
                  {t('datalogger.sessions.clearSelection', { count: props.selectedIds.length })}
                </Button>
              </Show>
              <Button
                size="sm"
                class="h-8 text-xs"
                onClick={props.onLoadSelected}
                disabled={props.selectedIds.length === 0 || props.loadingBatch}
              >
                <Show when={props.loadingBatch} fallback={<IconChartLine class="size-4" />}>
                  <IconLoader2 class="size-4 animate-spin" />
                </Show>
                {t('datalogger.sessions.loadSelectedBtn')}
              </Button>
            </div>
          </div>

          <SessionFilterBar
            value={filter()}
            onChange={(next) => {
              setFilter(next);
              setPage(1);
            }}
            totalCount={props.sessions.length}
            filteredCount={filteredSessions().length}
          />
        </CardHeader>
        <CardContent class="space-y-4">
          <Show
            when={!props.loading && filteredSessions().length > 0}
            fallback={
              <Show
                when={props.loading}
                fallback={
                  <div class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-14 text-center">
                    <div class="text-sm font-medium">
                      {props.sessions.length === 0
                        ? t('datalogger.sessions.noSessionsStored')
                        : t('datalogger.sessions.noSessionsOverlap')}
                    </div>
                    <Show when={props.sessions.length === 0}>
                      <Button size="sm" onClick={props.onGoToImport}>
                        {t('datalogger.sessions.importNewSession')}
                      </Button>
                    </Show>
                  </div>
                }
              >
                <div class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <IconLoader2 class="size-4 animate-spin" />
                  {t('datalogger.sessions.loadingStored')}
                </div>
              </Show>
            }
          >
            {/* 1. Desktop Tabular View (hidden on mobile) */}
            <div class="hidden md:block">
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-10">
                      <input
                        type="checkbox"
                        aria-label={t('datalogger.sessions.selectAllOnPage')}
                        checked={allOnPageSelected()}
                        onChange={(e) => handleToggleAllOnPage(e.currentTarget.checked)}
                        class="size-4 rounded border-input"
                      />
                    </TableHead>
                    <TableHead>{t('datalogger.sessions.colSessionName')}</TableHead>
                    <TableHead>{t('datalogger.sessions.colDeviceModel')}</TableHead>
                    <TableHead>{t('datalogger.sessions.colSerial')}</TableHead>
                    <TableHead class="text-right">{t('datalogger.sessions.colReadings')}</TableHead>
                    <TableHead>{t('datalogger.sessions.colTimeRange')}</TableHead>
                    <TableHead class="text-right">{t('datalogger.sessions.colTempRange')}</TableHead>
                    <TableHead>{t('datalogger.sessions.colImported')}</TableHead>
                    <TableHead class="w-28 text-right">{t('datalogger.sessions.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={paginatedSessions()}>
                    {(session) => {
                      const isChecked = () => props.selectedIds.includes(session.id);
                      const isRenaming = () => renamingId() === session.id;

                      return (
                        <TableRow data-state={isChecked() ? 'selected' : undefined}>
                          <TableCell>
                            <input
                              type="checkbox"
                              aria-label={t('datalogger.sessions.selectSession', { name: session.name })}
                              checked={isChecked()}
                              onChange={() => props.onToggleSelect(session.id)}
                              class="size-4 rounded border-input"
                            />
                          </TableCell>
                          <TableCell class="font-medium">
                            <Show
                              when={isRenaming()}
                              fallback={
                                <div class="flex items-center gap-2">
                                  <span class="truncate max-w-[240px]">{session.name}</span>
                                  <Show when={session.has_humidity}>
                                    <Badge variant="secondary" class="text-[10px] px-1 py-0">
                                      RH
                                    </Badge>
                                  </Show>
                                </div>
                              }
                            >
                              <div class="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameDraft()}
                                  onInput={(e) => setRenameDraft(e.currentTarget.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleRenameSubmit(session.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                  }}
                                  class="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  class="size-7"
                                  onClick={() => handleRenameSubmit(session.id)}
                                  disabled={busyId() === session.id}
                                >
                                  <IconCheck class="size-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  class="size-7"
                                  onClick={() => setRenamingId(null)}
                                >
                                  <IconX class="size-3.5" />
                                </Button>
                              </div>
                            </Show>
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            {session.device_model || 'CSV Import'}
                          </TableCell>
                          <TableCell class="font-mono text-xs text-muted-foreground">
                            {session.serial_number || '—'}
                          </TableCell>
                          <TableCell class="text-right font-mono text-xs tabular-nums">
                            {session.record_count.toLocaleString()}
                          </TableCell>
                          <TableCell class="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {session.start_time
                              ? `${formatDateTimeShort(session.start_time)} → ${formatDateTimeShort(session.end_time)}`
                              : '—'}
                          </TableCell>
                          <TableCell class="text-right font-mono text-xs tabular-nums">
                            {session.record_count > 0
                              ? `${session.temp_min.toFixed(1)}°–${session.temp_max.toFixed(1)}°C`
                              : '—'}
                          </TableCell>
                          <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeAgo(session.created_at)}
                          </TableCell>
                          <TableCell class="text-right">
                            <div class="flex items-center justify-end gap-1">
                              <A
                                href={dataloggerRecordsPath(session.id)}
                                class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={t('datalogger.sessions.viewRawDataTooltip')}
                              >
                                <IconDatabase class="size-3.5" />
                              </A>
                              <Button
                                size="icon"
                                variant="ghost"
                                class="size-8"
                                title={t('datalogger.sessions.renameTooltip')}
                                onClick={() => {
                                  setRenamingId(session.id);
                                  setRenameDraft(session.name);
                                }}
                              >
                                <IconEdit class="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                class="size-8 text-destructive hover:text-destructive"
                                title={t('datalogger.sessions.deleteTooltip')}
                                disabled={busyId() === session.id}
                                onClick={() => handleDelete(session)}
                              >
                                <IconTrash class="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </For>
                </TableBody>
              </DataTable>
            </div>

            {/* 2. Mobile Responsive Card List (shown on phone/tablet < md) */}
            <div class="block md:hidden space-y-3">
              {/* Mobile Quick-Selection Bar */}
              <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30 text-xs">
                <label class="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected()}
                    onChange={(e) => handleToggleAllOnPage(e.currentTarget.checked)}
                    class="size-4 rounded border-input"
                  />
                  <span>{t('datalogger.sessions.selectPageCount', { count: paginatedSessions().length })}</span>
                </label>
                <div class="flex items-center gap-1.5">
                  <Badge variant={props.selectedIds.length > 0 ? 'default' : 'secondary'} class="font-mono text-xs">
                    {t('datalogger.sessions.countSelected', { count: props.selectedIds.length })}
                  </Badge>
                  <Show when={props.selectedIds.length > 0}>
                    <Button variant="ghost" size="sm" class="h-6 px-1.5 text-xs" onClick={props.onClearSelection}>
                      {t('datalogger.sessions.clearSelectionShort')}
                    </Button>
                  </Show>
                </div>
              </div>

              {/* Cards List */}
              <For each={paginatedSessions()}>
                {(session) => {
                  const isChecked = () => props.selectedIds.includes(session.id);
                  const isRenaming = () => renamingId() === session.id;

                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!isRenaming()) props.onToggleSelect(session.id);
                      }}
                      onKeyDown={(e) => {
                        if (!isRenaming() && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          props.onToggleSelect(session.id);
                        }
                      }}
                      class={`rounded-lg border p-3.5 space-y-2.5 transition-colors cursor-pointer ${
                        isChecked()
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      {/* Top Header of Card */}
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            aria-label={t('datalogger.sessions.selectSession', { name: session.name })}
                            checked={isChecked()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => props.onToggleSelect(session.id)}
                            class="mt-0.5 size-4 shrink-0 rounded border-input"
                          />
                          <div class="min-w-0">
                            <Show
                              when={isRenaming()}
                              fallback={
                                <div class="font-medium text-sm leading-snug break-words">
                                  {session.name}
                                </div>
                              }
                            >
                              <div class="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={renameDraft()}
                                  onInput={(e) => setRenameDraft(e.currentTarget.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleRenameSubmit(session.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                  }}
                                  class="h-7 w-36 rounded border border-input bg-background px-2 text-xs"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  class="size-6"
                                  onClick={() => handleRenameSubmit(session.id)}
                                  disabled={busyId() === session.id}
                                >
                                  <IconCheck class="size-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  class="size-6"
                                  onClick={() => setRenamingId(null)}
                                >
                                  <IconX class="size-3" />
                                </Button>
                              </div>
                            </Show>
                            <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <span>{session.device_model || 'CSV Import'}</span>
                              <Show when={session.serial_number}>
                                <span class="font-mono">· {session.serial_number}</span>
                              </Show>
                              <Show when={session.has_humidity}>
                                <Badge variant="secondary" class="text-[10px] px-1 py-0">
                                  RH
                                </Badge>
                              </Show>
                            </div>
                          </div>
                        </div>

                        {/* Actions right on card */}
                        <div class="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <A
                            href={dataloggerRecordsPath(session.id)}
                            class="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('datalogger.sessions.viewRawDataTooltip')}
                          >
                            <IconDatabase class="size-3.5" />
                          </A>
                          <Button
                            size="icon"
                            variant="ghost"
                            class="size-7"
                            title={t('datalogger.sessions.renameTooltip')}
                            onClick={() => {
                              setRenamingId(session.id);
                              setRenameDraft(session.name);
                            }}
                          >
                            <IconEdit class="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            class="size-7 text-destructive hover:text-destructive"
                            title={t('datalogger.sessions.deleteTooltip')}
                            disabled={busyId() === session.id}
                            onClick={() => handleDelete(session)}
                          >
                            <IconTrash class="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Card Micro-Grid */}
                      <div class="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t">
                        <div>
                          <span class="text-muted-foreground text-[11px]">{t('datalogger.sessions.cardReadings')}</span>{' '}
                          <strong class="font-mono tabular-nums">{session.record_count.toLocaleString()}</strong>
                        </div>
                        <div>
                          <span class="text-muted-foreground text-[11px]">{t('datalogger.sessions.cardTempRange')}</span>{' '}
                          <strong class="font-mono tabular-nums text-foreground">
                            {session.record_count > 0
                              ? `${session.temp_min.toFixed(1)}°–${session.temp_max.toFixed(1)}°C`
                              : '—'}
                          </strong>
                        </div>
                        <div class="col-span-2 font-mono text-[11px] text-muted-foreground truncate">
                          <span class="text-muted-foreground font-sans">{t('datalogger.sessions.cardWindow')}</span>
                          {session.start_time
                            ? `${formatDateTimeShort(session.start_time)} → ${formatDateTimeShort(session.end_time)}`
                            : '—'}
                        </div>
                        <div class="col-span-2 text-[11px] text-muted-foreground">
                          {t('datalogger.sessions.cardImported', { time: formatRelativeAgo(session.created_at) })}
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            <PaginationControls
              total={filteredSessions().length}
              page={page()}
              pageSize={pageSize()}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="sessions"
            />
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}
