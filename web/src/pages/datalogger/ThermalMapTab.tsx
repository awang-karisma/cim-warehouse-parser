import { Show, batch, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { IconCheck, IconDatabase, IconEdit } from '@tabler/icons-solidjs';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { useAuth } from '~/auth';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { SessionMappingsDialog } from '~/components/thermal-map/SessionMappingsDialog';
import { EditorMode, type Selection } from '~/components/thermal-map/EditorMode';
import { emptyLayout, validateLayout, type LayoutIssue, type RoomLayout } from '~/components/thermal-map/layout';
import { buildThermalData, pendingSessionIDs, type Series } from '~/components/thermal-map/series';
import { createThermalSources } from '~/components/thermal-map/sources';
import type { Projection } from '~/components/thermal-map/ThermalScene';
import { ThermalView, type PlaybackSpeed, type RendererStatus } from '~/components/thermal-map/ThermalView';
import { useI18n } from '~/i18n';
import type { DataloggerRecord } from '~/types';

type Confirmation = { layout: RoomLayout } | { remove: Selection };

export default function ThermalMapTab(props: {
  active: boolean;
  sessions: string;
  loadedIds: readonly number[];
  records: Record<string, DataloggerRecord[]>;
  loadRecords: (ids: readonly number[]) => Promise<void>;
  onGoToImport: () => void;
}) {
  const { t } = useI18n();
  const auth = useAuth();
  const [layout, setLayout] = createStore(emptyLayout());
  const [selection, setSelection] = createSignal<Selection>();
  const [confirmation, setConfirmation] = createSignal<Confirmation>();
  const [fileIssue, setFileIssue] = createSignal<LayoutIssue | 'invalidJson'>();
  const [mappingsOpen, setMappingsOpen] = createSignal(false);
  const [data, setData] = createSignal(buildThermalData(new Map()));
  const [editing, setEditing] = createSignal(false);
  const [projection, setProjection] = createSignal<Projection>('floor');
  const [activeTime, setActiveTime] = createSignal<number>();
  const [playing, setPlaying] = createSignal(false);
  const [speed, setSpeed] = createSignal<PlaybackSpeed>(1);
  const [rendererStatus, setRendererStatus] = createSignal<RendererStatus>('loading');
  const [rendererAttempt, setRendererAttempt] = createSignal(1);
  let frame = 0;
  let inFrame = false;
  let draw: (() => void) | undefined;
  let pendingTime: number | undefined;
  let baseInstant = 0;
  let baseFrame = 0;
  const staging = createThermalSources(props.loadRecords, () => props.records);
  const [preparing, setPreparing] = createSignal(false);
  let layoutRead = 0;
  onCleanup(() => {
    layoutRead++;
    if (frame) cancelAnimationFrame(frame);
  });
  onMount(() => {
    const visibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', visibility);
    onCleanup(() => document.removeEventListener('visibilitychange', visibility));
  });
  createEffect(on([() => props.active, () => props.sessions, () => props.loadedIds], ([active, query, ids]) => {
    if (!active) return;
    setPreparing(true);
    let work = 0;
    const paint = requestAnimationFrame(() => {
      work = requestAnimationFrame(() => {
        staging.addPending([...new Set([...ids, ...pendingSessionIDs(query)])]);
        setPreparing(false);
      });
    });
    onCleanup(() => { cancelAnimationFrame(paint); cancelAnimationFrame(work); });
  }));
  createEffect(on(() => props.active, (active) => {
    if (active) return;
    layoutRead++;
    batch(() => {
      pausePlayback();
      setMappingsOpen(false);
      setConfirmation(undefined);
    });
  }));

  function advance(now: number) {
    const end = data().timeline.at(-1);
    if (end === undefined) { setPlaying(false); return; }
    const next = baseInstant + Math.max(0, now - baseFrame) * speed();
    setActiveTime(Math.min(next, end));
    if (next >= end) setPlaying(false);
  }

  function requestFrame() {
    if (frame || inFrame) return;
    frame = requestAnimationFrame((now) => {
      frame = 0;
      inFrame = true;
      if (pendingTime !== undefined) {
        setActiveTime(pendingTime);
        pendingTime = undefined;
      }
      if (playing()) advance(now);
      draw?.();
      inFrame = false;
      if (playing()) requestFrame();
    });
  }

  function bindDraw(next: () => void) {
    draw = next;
    return () => {
      if (draw !== next) return;
      draw = undefined;
      if (frame && pendingTime === undefined && !playing()) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
  }

  function scrub(index: number) {
    setPlaying(false);
    pendingTime = data().timeline[index];
    requestFrame();
  }

  function playPause() {
    if (playing()) { setPlaying(false); return; }
    const times = data().timeline;
    if (times.length < 2 || rendererStatus() !== 'ready' || document.hidden) return;
    const first = times[0];
    const current = pendingTime ?? activeTime() ?? first;
    pendingTime = undefined;
    baseInstant = current >= times[times.length - 1] ? first : current;
    baseFrame = performance.now();
    setActiveTime(baseInstant);
    setPlaying(true);
    requestFrame();
  }

  function changeSpeed(next: PlaybackSpeed) {
    if (next === speed()) return;
    if (playing()) {
      const now = performance.now();
      advance(now);
      baseFrame = now;
      baseInstant = activeTime()!;
    }
    setSpeed(next);
  }

  function pausePlayback() {
    setPlaying(false);
    if (pendingTime !== undefined) setActiveTime(pendingTime);
    pendingTime = undefined;
  }

  function changeEditing(next: boolean) {
    batch(() => {
      pausePlayback();
      if (!next) {
        layoutRead++;
        setFileIssue(undefined);
        setRendererStatus('loading');
      }
      setEditing(next);
    });
  }

  async function importLayout(file: File) {
    const read = ++layoutRead;
    setFileIssue(undefined);
    setConfirmation(undefined);
    try {
      const result = validateLayout(JSON.parse(await file.text()));
      if (read !== layoutRead) return;
      if ('issue' in result) setFileIssue(result.issue);
      else setConfirmation({ layout: result.layout });
    } catch {
      if (read === layoutRead) setFileIssue('invalidJson');
    }
  }

  function exportLayout() {
    const blob = new Blob([JSON.stringify(unwrap(layout), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'room-layout.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function replaceData(series: ReadonlyMap<string, Series>) {
    const committed = buildThermalData(series);
    pendingTime = undefined;
    batch(() => {
      setPlaying(false);
      setData(committed);
      setActiveTime(committed.timeline[0]);
    });
  }

  function renameSensor(from: string, id: string) {
    batch(() => {
      setSelection({ kind: 'sensor', id });
      staging.remap(from, id);
      const existing = data().bySensor.get(from);
      if (!existing) return;
      const series = new Map(data().bySensor);
      series.delete(from);
      series.set(id, existing);
      setData({ ...data(), bySensor: series });
    });
  }

  function confirm() {
    const action = confirmation();
    if (!action) return;
    batch(() => {
      if ('layout' in action) {
        staging.remap(undefined);
        replaceData(new Map());
        setLayout(reconcile(action.layout));
      } else if (action.remove.kind === 'sensor') {
        staging.remap(action.remove.id);
        setLayout('sensors', (items) => items.filter((item) => item.id !== action.remove.id));
        if (data().bySensor.has(action.remove.id)) {
          const series = new Map(data().bySensor);
          series.delete(action.remove.id);
          replaceData(series);
        }
      } else setLayout('walls', (items) => items.filter((item) => item.id !== action.remove.id));
      setSelection(undefined);
      setConfirmation(undefined);
    });
  }
  const confirmationLabel = () => {
    const action = confirmation();
    return t(action && 'layout' in action ? 'thermal.replace' : 'thermal.delete');
  };

  return <Show when={props.active}>
    <div class="min-w-0 space-y-3">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold tracking-tight">{t(editing() ? 'thermal.edit' : 'thermal.title')}</h2>
          <Show when={!editing() && layout.sensors.length > 0}>
            <p class="text-sm text-muted-foreground">{t('thermal.coverage', { mapped: data().bySensor.size, count: layout.sensors.length })}</p>
          </Show>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant={editing() || !layout.sensors.length ? 'default' : 'outline'} onClick={() => changeEditing(!editing())}>
            <Show when={editing()} fallback={<IconEdit class="size-4" aria-hidden="true" />}>
              <IconCheck class="size-4" aria-hidden="true" />
            </Show>
            {t(editing() ? 'thermal.doneEditing' : 'thermal.edit')}
          </Button>
          <Show when={!editing()}>
            <Button size="sm" variant={layout.sensors.length ? 'default' : 'outline'} onClick={() => { pausePlayback(); setMappingsOpen(true); }}>
              <IconDatabase class="size-4" aria-hidden="true" />{t('thermal.assignSessions')}
            </Button>
          </Show>
        </div>
      </header>
      <Show when={preparing() || staging.sources().some((source) => source.state() === 'loading')}>
        <p role="status" class="text-sm text-muted-foreground">{t('thermal.loadingMap')}</p>
      </Show>
      <Show when={fileIssue()}>{(problem) => {
        const message = () => {
          const issue = problem();
          return issue === 'invalidJson' ? t('thermal.invalidJson') : t(`thermal.${issue.code}`, { field: issue.field });
        };
        return <p role="alert" class="rounded-md border border-destructive/35 p-3 text-sm text-destructive">{message()}</p>;
      }}</Show>
      <Show when={editing()} fallback={
        <ThermalView layout={layout} data={data()} activeTime={activeTime()} playing={playing()} speed={speed()} projection={projection()}
          rendererStatus={rendererStatus()} rendererAttempt={rendererAttempt()} onProjection={setProjection}
          onScrub={scrub} onSpeed={changeSpeed} onPlayPause={playPause} requestFrame={requestFrame} bindDraw={bindDraw}
          onReady={() => setRendererStatus('ready')}
          onUnavailable={() => batch(() => { setPlaying(false); setRendererStatus('unavailable'); })}
          onRetry={() => batch(() => { setRendererStatus('loading'); setRendererAttempt((attempt) => attempt + 1); })} />
      }>
        <EditorMode layout={layout} selection={selection()} onSelect={setSelection} onLayout={(value) => setLayout(reconcile(value))}
          onRename={renameSensor} onDelete={(remove) => setConfirmation({ remove })} onImport={importLayout} onExport={exportLayout} />
      </Show>
      <SessionMappingsDialog open={mappingsOpen()} onOpenChange={setMappingsOpen} sensors={layout.sensors} staging={staging} mappedCount={data().bySensor.size}
        onEdit={() => { setMappingsOpen(false); changeEditing(true); }}
        onGoToImport={auth.canAny('logger_session:create', 'logger_device:read') ? () => { if (auth.canAny('logger_session:create', 'logger_device:read')) { setMappingsOpen(false); props.onGoToImport(); } } : undefined}
        onApply={(series) => { replaceData(series); setMappingsOpen(false); }} />
      <AlertDialog open={!!confirmation()} onOpenChange={(open) => { if (!open) setConfirmation(undefined); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{confirmationLabel()}</AlertDialogTitle>
          <AlertDialogDescription>{(() => {
            const action = confirmation();
            return action && 'remove' in action ? t('thermal.confirmDelete', { id: action.remove.id }) : t('thermal.confirmLayout');
          })()}</AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(undefined)}>{t('thermal.cancel')}</Button>
            <Button variant="destructive" onClick={confirm}>{confirmationLabel()}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </Show>;
}
