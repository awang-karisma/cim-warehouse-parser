import { For, Show, createMemo } from 'solid-js';
import { IconCube, IconLayout2, IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-solidjs';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/i18n';
import { Inspector } from './EditorMode';
import { HEAT_COLORS, heatGradient } from './heat';
import type { RoomLayout } from './layout';
import { indexAtOrBefore, readSample, type Provenance, type Reading, type ThermalData } from './series';
import { ThermalScene, type Projection } from './ThermalScene';

export type PlaybackSpeed = 1 | 10 | 60;
export type RendererStatus = 'loading' | 'ready' | 'unavailable';
const speeds: PlaybackSpeed[] = [1, 10, 60];
const scrubKey = /^(?:Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/;

export function ThermalView(props: {
  layout: RoomLayout;
  data: ThermalData;
  activeTime: number | undefined;
  playing: boolean;
  speed: PlaybackSpeed;
  projection: Projection;
  rendererStatus: RendererStatus;
  rendererAttempt: number;
  onProjection: (projection: Projection) => void;
  onPlayPause: () => void;
  onSpeed: (speed: PlaybackSpeed) => void;
  onScrub: (index: number) => void;
  requestFrame: () => void;
  bindDraw: (draw: () => void) => () => void;
  onReady: () => void;
  onUnavailable: () => void;
  onRetry: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const degree = createMemo(() => new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const measure = createMemo(() => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 3 }));
  const date = createMemo(() => new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }));
  const format = (value: number) => `${degree().format(value)} °C`;
  const legendTemperature = (value: number) => `${measure().format(value)} °C`;
  const provenance = (kind: Provenance) => t(`thermal.${kind}`);
  const timeline = () => props.data.timeline;
  const index = createMemo(() => Math.max(0, indexAtOrBefore(timeline(), props.activeTime ?? -Infinity)));
  const displaySecond = createMemo(() => {
    const active = props.activeTime;
    return active === undefined ? undefined : Math.floor(active / 1000) * 1000;
  });
  const timestamp = createMemo(() => {
    const instant = displaySecond();
    return instant === undefined ? t('thermal.noTimestamp') : date().format(instant);
  });
  const sampleBuffer = createMemo(() => new Map<string, Reading>(props.layout.sensors.map((sensor) => [sensor.id, { value: NaN, status: 'unavailable' }])));
  const readings = createMemo(() => {
    const samples = sampleBuffer();
    const at = props.activeTime;
    const series = props.data.bySensor;
    for (const [id, out] of samples) readSample(series.get(id), at, out);
    return samples;
  }, undefined, { equals: false });

  function inspector() {
    return <div class="space-y-3">
      <h2 class="text-sm font-semibold">{t('thermal.liveSensors')} · {props.layout.sensors.length}</h2>
      <ul class="divide-y rounded-md border" aria-label={t('thermal.liveSensors')}>
        <For each={props.layout.sensors} fallback={<li class="px-3 py-2 text-sm text-muted-foreground">{t('thermal.placeFirst')}</li>}>
          {(sensor) => {
            const status = () => readings().get(sensor.id)?.status ?? 'unavailable';
            const value = () => readings().get(sensor.id)?.value ?? NaN;
            return <li class="grid min-w-0 gap-1 px-3 py-2.5">
              <div class="flex flex-wrap items-baseline justify-between gap-x-2">
                <span class="min-w-0 break-all text-sm font-semibold">{sensor.id}</span>
                <span title={provenance(status())} class="whitespace-nowrap font-mono text-sm tabular-nums">{status() === 'unavailable' ? '—' : format(value())}</span>
              </div>
              <p class="text-xs tabular-nums text-muted-foreground">X {measure().format(sensor.x)} · Y {measure().format(sensor.y)} · Z {measure().format(sensor.z)} m</p>
              <p class="text-xs text-muted-foreground">{provenance(status())}</p>
            </li>;
          }}
        </For>
      </ul>
    </div>;
  }

  return <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <section class="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label={t('thermal.scene')}>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div class="flex flex-wrap gap-1" role="group" aria-label={t('thermal.projection')}>
          <Button size="sm" variant={props.projection === 'floor' ? 'default' : 'outline'} aria-pressed={props.projection === 'floor'} onClick={() => props.onProjection('floor')}><IconLayout2 class="size-4" aria-hidden="true" />{t('thermal.floorSlice')}</Button>
          <Button size="sm" variant={props.projection === 'volume' ? 'default' : 'outline'} aria-pressed={props.projection === 'volume'} onClick={() => props.onProjection('volume')}><IconCube class="size-4" aria-hidden="true" />{t('thermal.volume')}</Button>
        </div>
        <div class="min-w-0 space-y-1 text-xs text-muted-foreground" aria-label={t('thermal.legend')}>
          <p class="font-medium text-foreground">{t('thermal.legend')}</p>
          <Show when={props.data.min !== undefined && props.data.max !== undefined} fallback={<p>{t('thermal.noScale')}</p>}>
            <Show when={props.data.min !== props.data.max} fallback={
              <div class="flex items-center gap-1.5 tabular-nums"><span class="size-2.5 rounded-sm" style={{ background: HEAT_COLORS[1] }} aria-hidden="true" />{legendTemperature(props.data.min!)}</div>
            }>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
                <span>{legendTemperature(props.data.min!)}</span><span class="h-2 w-22 rounded-sm sm:w-26" style={{ background: heatGradient }} aria-hidden="true" /><span>{legendTemperature(props.data.max!)}</span>
              </div>
            </Show>
          </Show>
          <p class="max-w-sm">{t('thermal.fieldNote')}</p>
        </div>
      </div>
      <div class="relative isolate h-[clamp(16rem,53vh,35rem)] min-w-0 bg-muted/45">
        <Show when={props.rendererAttempt} keyed>{(_attempt) => <ThermalScene layout={props.layout} projection={props.projection} readings={readings()}
          min={props.data.min} max={props.data.max} format={format} provenance={provenance} requestFrame={props.requestFrame} bindDraw={props.bindDraw}
          onReady={props.onReady} onUnavailable={props.onUnavailable} />}</Show>
        <Show when={props.rendererStatus === 'unavailable'}>
          <div class="absolute inset-0 grid place-items-center bg-muted p-4 text-center">
            <div class="max-w-sm space-y-2" role="status">
              <p class="font-semibold">{t('thermal.rendererUnavailable')}</p>
              <p class="text-sm text-muted-foreground">{t('thermal.rendererHelp')}</p>
              <Button size="sm" variant="outline" onClick={props.onRetry}><IconRefresh class="size-4" aria-hidden="true" />{t('thermal.retry')}</Button>
            </div>
          </div>
        </Show>
      </div>
      <div class="space-y-3 border-t p-3 sm:p-4">
        <Show when={!props.data.bySensor.size}>
          <p class="text-sm text-muted-foreground">{t(props.layout.sensors.length ? 'thermal.bindFirst' : 'thermal.placeFirst')}</p>
        </Show>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-medium">{t('thermal.timeline')}</span>
          <time class="text-sm tabular-nums text-muted-foreground" dateTime={displaySecond() === undefined ? undefined : new Date(displaySecond()!).toISOString()}>{timestamp()}</time>
        </div>
        <input class="block w-full accent-primary disabled:opacity-45" type="range" min="0" max={Math.max(0, timeline().length - 1)} step="1" value={index()}
          aria-label={t('thermal.timeline')} aria-valuetext={timestamp()} disabled={timeline().length < 2}
          onPointerDown={(event) => props.onScrub(event.currentTarget.valueAsNumber)}
          onKeyDown={(event) => {
            if (scrubKey.test(event.key)) props.onScrub(event.currentTarget.valueAsNumber);
          }}
          onInput={(event) => props.onScrub(event.currentTarget.valueAsNumber)} />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" onClick={props.onPlayPause} disabled={timeline().length < 2 || props.rendererStatus !== 'ready'}>
            <Show when={props.playing} fallback={<><IconPlayerPlay class="size-4" aria-hidden="true" />{t('thermal.play')}</>}>
              <IconPlayerPause class="size-4" aria-hidden="true" />{t('thermal.pause')}
            </Show>
          </Button>
          <div class="flex flex-wrap items-center gap-1" role="group" aria-label={t('thermal.speeds')}>
            <span class="mr-1 text-xs text-muted-foreground">{t('thermal.speeds')}</span>
            <For each={speeds}>{(speed) => <Button size="sm" variant={props.speed === speed ? 'default' : 'outline'} aria-pressed={props.speed === speed} onClick={() => props.onSpeed(speed)}>{speed}×</Button>}</For>
          </div>
        </div>
      </div>
    </section>
    <Inspector title={t('thermal.liveSensors')} description={t('thermal.readingNote')}>{inspector}</Inspector>
  </div>;
}
