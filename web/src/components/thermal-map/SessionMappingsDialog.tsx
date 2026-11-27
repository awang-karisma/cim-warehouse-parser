import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { getDataloggerSessions } from '~/api';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { useI18n } from '~/i18n';
import { createDebouncedSignal } from '~/utils/debounce';
import type { Sensor } from './layout';
import { previewSession, type Series, type SessionPreview, type Unit } from './series';
import type { ThermalSources } from './sources';

const inputClass = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm';
const pageSize = 8;

export function SessionMappingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensors: readonly Sensor[];
  staging: ThermalSources;
  mappedCount: number;
  onEdit: () => void;
  onGoToImport?: () => void;
  onApply: (series: ReadonlyMap<string, Series>) => void;
}) {
  const { t } = useI18n();
  const [search, query, setSearch] = createDebouncedSignal('', 250);
  const [offset, setOffset] = createSignal(0);
  const [page, { refetch }] = createResource(() => props.open && { q: query().trim(), limit: pageSize, offset: offset() }, async (params) => {
    try { return { result: await getDataloggerSessions(params) }; }
    catch { return { result: undefined }; }
  });
  const sourceIDs = createMemo(() => new Set(props.staging.sources().map((source) => source.id)));
  const preview = createMemo(() => {
    const uses = new Map<string, number>();
    const samples = new Map<number, SessionPreview>();
    const series = new Map<string, Series>();
    let blocked = false;
    for (const source of props.staging.sources()) {
      const { sensor, unit } = source.mapping();
      if (!sensor) continue;
      const count = (uses.get(sensor) ?? 0) + 1;
      uses.set(sensor, count);
      if (count > 1) blocked = true;
      if (source.state() !== 'ready') {
        blocked = true;
        continue;
      }
      const report = previewSession(source.records(), unit);
      samples.set(source.id, report);
      series.set(sensor, report.series);
      if (!report.series.times.length) blocked = true;
    }
    return { samples, uses, series, blocked };
  });
  const canApply = () => !preview().blocked && (preview().series.size > 0 || props.mappedCount > 0);

  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent class="gap-3 sm:max-w-3xl">
      <DialogTitle class="pr-6">{t('thermal.assignSessions')}</DialogTitle>
      <DialogDescription>{t('thermal.assignDescription')}</DialogDescription>
      <Show when={!props.sensors.length}>
        <p class="rounded-md border bg-muted/45 px-3 py-2 text-sm">
          {t('thermal.noSensors')} <Button variant="link" class="h-auto px-0" onClick={props.onEdit}>{t('thermal.edit')}</Button>
        </p>
      </Show>
      <div class="grid min-w-0 gap-4 md:grid-cols-2">
        <section class="min-w-0 space-y-2">
          <h3 class="text-sm font-semibold">{t('thermal.savedSessions')}</h3>
          <label class="grid gap-1 text-xs font-medium">
            <span class="sr-only">{t('thermal.searchSessions')}</span>
            <input type="search" class={inputClass} placeholder={t('thermal.searchSessions')} value={search()}
              onInput={(event) => { setSearch(event.currentTarget.value); setOffset(0); }} />
          </label>
          <Show when={!page.loading} fallback={<p role="status" class="text-sm text-muted-foreground">{t('thermal.source_loading')}</p>}>
            <Show when={page()?.result} fallback={<div class="flex flex-wrap items-center gap-2 text-sm" role="alert">
              {t('thermal.sessionsFailed')}<Button size="sm" variant="outline" onClick={() => void refetch()}>{t('thermal.retry')}</Button>
            </div>}>
              {(result) => <>
                <ul class="divide-y rounded-md border" aria-label={t('thermal.savedSessions')}>
                  <For each={result().sessions} fallback={<li class="p-2 text-sm text-muted-foreground">{t('thermal.noSessions')}</li>}>
                    {(session) => <li class="flex items-center justify-between gap-2 p-2">
                      <span class="min-w-0 break-words text-sm">{session.name} <span class="text-xs text-muted-foreground">#{session.id}</span></span>
                      <Button variant="outline" size="sm" disabled={sourceIDs().has(session.id)} aria-label={t('thermal.addNamed', { name: session.name })}
                        onClick={() => props.staging.addSession(session)}>{t(sourceIDs().has(session.id) ? 'thermal.added' : 'thermal.add')}</Button>
                    </li>}
                  </For>
                </ul>
                <Show when={result().total > pageSize}>
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t('thermal.sessionCount', { count: result().total })}</span>
                    <div class="flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" disabled={offset() <= 0} onClick={() => setOffset((n) => n - pageSize)}>{t('thermal.previous')}</Button>
                      <Button variant="outline" size="sm" disabled={offset() + pageSize >= result().total} onClick={() => setOffset((n) => n + pageSize)}>{t('thermal.next')}</Button>
                    </div>
                  </div>
                </Show>
              </>}
            </Show>
          </Show>
          <Show when={props.onGoToImport}><p class="text-xs text-muted-foreground">{t('thermal.newReadings')} <Button variant="link" class="h-auto px-0 text-xs" onClick={() => props.onGoToImport?.()}>{t('thermal.goToImport')}</Button></p></Show>
        </section>
        <section class="min-w-0 space-y-2">
          <h3 class="text-sm font-semibold">{t('thermal.assignments')}</h3>
          <For each={props.staging.sources()} fallback={<p class="rounded-md border p-3 text-sm text-muted-foreground">{t('thermal.noAssignments')}</p>}>
            {(source) => {
              const name = () => source.metadata()?.name ?? t('thermal.sessionNumber', { id: source.id });
              const conflict = () => (preview().uses.get(source.mapping().sensor) ?? 0) > 1;
              return <article class="rounded-md border">
                <div class="flex items-center justify-between gap-2 px-3 py-2">
                  <h4 class="min-w-0 break-words text-sm font-medium">{name()}</h4>
                  <Button variant="ghost" size="sm" aria-label={t('thermal.removeNamed', { name: name() })} onClick={() => props.staging.remove(source)}>{t('thermal.remove')}</Button>
                </div>
                <Show when={source.state() !== 'ready'} fallback={
                  <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2 border-t px-3 py-2">
                    <label class="grid min-w-0 gap-1 text-xs text-muted-foreground">{t('thermal.sensor')}
                      <select class={inputClass} aria-label={t('thermal.sensorFor', { name: name() })} aria-invalid={conflict() || undefined}
                        disabled={!props.sensors.length} value={source.mapping().sensor}
                        onChange={(event) => source.setMapping({ ...source.mapping(), sensor: event.currentTarget.value })}>
                        <option value="">{t('thermal.skip')}</option>
                        <For each={props.sensors}>{(sensor) => <option value={sensor.id}>{sensor.id}</option>}</For>
                      </select>
                    </label>
                    <label class="grid min-w-0 gap-1 text-xs text-muted-foreground">{t('thermal.recordedUnit')}
                      <select class={inputClass} aria-label={t('thermal.unitFor', { name: name() })} value={source.mapping().unit}
                        onChange={(event) => source.setMapping({ ...source.mapping(), unit: event.currentTarget.value as Unit })}>
                        <option value="C">°C</option><option value="F">°F</option>
                      </select>
                    </label>
                    <Show when={conflict()}><p class="col-span-2 text-xs text-destructive" role="alert">{t('thermal.mappingConflict', { sensor: source.mapping().sensor })}</p></Show>
                    <Show when={preview().samples.get(source.id)}>{(report) => <div class="col-span-2 space-y-1 text-xs text-muted-foreground">
                      <p>{t('thermal.sampleCounts', { accepted: report().series.times.length, skipped: report().skipped })}
                        <Show when={report().duplicates}> · {t('thermal.duplicatesReplaced', { count: report().duplicates })}</Show>
                      </p>
                      <Show when={!report().series.times.length}><p class="text-destructive" role="alert">{t('thermal.noValidSamples')}</p></Show>
                    </div>}</Show>
                  </div>
                }>
                  <div class="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                    <p role={source.state() === 'loading' ? 'status' : 'alert'}>{t(`thermal.source_${source.state()}`)}</p>
                    <Show when={source.state() !== 'loading'}><Button variant="outline" size="sm" onClick={() => props.staging.retry(source)}>{t('thermal.retry')}</Button></Show>
                  </div>
                </Show>
              </article>;
            }}
          </For>
        </section>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p class="text-sm text-muted-foreground">{t('thermal.mappedCount', { count: props.mappedCount })}</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>{t('thermal.cancel')}</Button>
          <Button disabled={!canApply()} onClick={() => { if (canApply()) props.onApply(preview().series); }}>{t('thermal.applyMappings')}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
