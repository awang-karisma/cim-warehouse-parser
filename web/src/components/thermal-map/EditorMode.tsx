import { For, Show, createMemo, createSignal, createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { IconDownload, IconLine, IconMapPin, IconPointer, IconUpload } from '@tabler/icons-solidjs';
import { Button } from '~/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet';
import { useI18n } from '~/i18n';
import { inside, nextID, validateLayout, type LayoutIssue, type RoomLayout, type Sensor, type Wall } from './layout';

export type Selection = { kind: 'sensor' | 'wall'; id: string };
type Tool = 'select' | Selection['kind'];
type XY = { x: number; y: number };
type Endpoint = 1 | 2;

const inputClass = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm tabular-nums';
const fieldClass = 'grid min-w-0 gap-1 text-xs font-medium';
const wallFields = ['x1', 'y1', 'x2', 'y2'] as const;
const sensorFields = ['x', 'y', 'z'] as const;
const roomFields = ['width', 'depth', 'height'] as const;

export function Inspector(props: { title: string; description: string; children: () => JSX.Element }) {
  const [wide, setWide] = createSignal(window.matchMedia('(min-width: 1024px)').matches);
  onMount(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const change = () => setWide(mq.matches);
    mq.addEventListener('change', change);
    onCleanup(() => mq.removeEventListener('change', change));
  });
  return (
    <Show when={wide()} fallback={
      <Sheet>
        <SheetTrigger as={Button} variant="outline" class="w-full sm:w-auto">{props.title}</SheetTrigger>
        <SheetContent position="right" class="w-[min(100%,24rem)] overflow-y-auto">
          <SheetHeader class="mb-5 text-left">
            <SheetTitle>{props.title}</SheetTitle>
            <SheetDescription>{props.description}</SheetDescription>
          </SheetHeader>
          {props.children()}
        </SheetContent>
      </Sheet>
    }>
      <aside class="min-w-0 rounded-lg border bg-card p-4 lg:max-h-[min(78vh,52rem)] lg:overflow-y-auto" aria-label={props.title}>
        {props.children()}
        <p class="mt-3 text-xs text-muted-foreground">{props.description}</p>
      </aside>
    </Show>
  );
}

export function EditorMode(props: {
  layout: RoomLayout;
  selection: Selection | undefined;
  onSelect: (value?: Selection) => void;
  onLayout: (value: RoomLayout) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (selection: Selection) => void;
  onImport: (file: File) => void;
  onExport: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const [tool, setTool] = createSignal<Tool>('select');
  const [pending, setPending] = createSignal<XY>();
  const [issue, setIssue] = createSignal<LayoutIssue>();
  const [showWallForm, setShowWallForm] = createSignal(false);
  const gridID = createUniqueId();
  let svg!: SVGSVGElement;
  let file!: HTMLInputElement;
  let drag: { pointer: number; selection: Selection; endpoint?: Endpoint; dx: number; dy: number } | undefined;

  const room = () => props.layout.room;
  const scale = () => Math.max(room().width, room().depth);
  const project = (value: number) => value / scale() * 600;
  const w = () => project(room().width);
  const h = () => project(room().depth);
  const selected = (kind: Selection['kind'], id: string) => props.selection?.kind === kind && props.selection.id === id;
  const sensor = createMemo(() => props.selection?.kind === 'sensor' ? props.layout.sensors.find((item) => item.id === props.selection?.id) : undefined);
  const wall = createMemo(() => props.selection?.kind === 'wall' ? props.layout.walls.find((item) => item.id === props.selection?.id) : undefined);
  const format = (n: number) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 3 }).format(n);
  const cancel = () => { setPending(undefined); setIssue(undefined); };
  // Imported layouts can change bounds independently of a half-drawn partition.
  const firstPoint = () => {
    const point = pending();
    return point && inside(point.x, room().width) && inside(point.y, room().depth) ? point : undefined;
  };

  onMount(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key);
    onCleanup(() => window.removeEventListener('keydown', key));
  });

  function apply(candidate: RoomLayout, commit = props.onLayout) {
    const result = validateLayout(candidate);
    if ('issue' in result) {
      setIssue(result.issue);
      return false;
    }
    setIssue(undefined);
    commit(result.layout);
    return true;
  }
  function point(event: PointerEvent): XY | undefined {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x / 600 * scale(), y: p.y / 600 * scale() };
  }
  function clamp(p: XY): XY {
    const axis = (n: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(n * 1000) ? Math.round(n * 1000) / 1000 : n));
    return { x: axis(p.x, room().width), y: axis(p.y, room().depth) };
  }
  function addSensor(p: XY) {
    const id = nextID('S', props.layout.sensors);
    if (apply({ ...props.layout, sensors: [...props.layout.sensors, { ...p, id, z: 0 }] })) props.onSelect({ kind: 'sensor', id });
  }
  function addWall(values: Omit<Wall, 'id'>) {
    const id = nextID('W', props.layout.walls);
    if (!apply({ ...props.layout, walls: [...props.layout.walls, { ...values, id }] })) return;
    setPending(undefined);
    setShowWallForm(false);
    props.onSelect({ kind: 'wall', id });
  }
  function changeSensor(existing: Sensor, patch: Partial<Sensor>) {
    const renamed = patch.id?.trim();
    return apply({ ...props.layout, sensors: props.layout.sensors.map((item) => item.id === existing.id ? { ...item, ...patch } : item) }, (next) => {
      props.onLayout(next);
      if (renamed && renamed !== existing.id) props.onRename(existing.id, renamed);
    });
  }
  function changeWall(existing: Wall, patch: Partial<Wall>) {
    return apply({ ...props.layout, walls: props.layout.walls.map((item) => item.id === existing.id ? { ...item, ...patch } : item) });
  }
  function onPlanDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    if (tool() === 'select') { props.onSelect(); return; }
    const raw = point(event);
    if (!raw || !inside(raw.x, room().width) || !inside(raw.y, room().depth)) return;
    const p = clamp(raw);
    if (tool() === 'sensor') { addSensor(p); return; }
    const first = firstPoint();
    if (first) addWall({ x1: first.x, y1: first.y, x2: p.x, y2: p.y });
    else setPending(p);
  }
  function startDrag(event: PointerEvent, selection: Selection, at: XY, endpoint?: Endpoint) {
    if (tool() !== 'select' || !event.isPrimary || event.button !== 0) return;
    const p = point(event);
    if (!p) return;
    event.stopPropagation();
    props.onSelect(selection);
    drag = { pointer: event.pointerId, selection, endpoint, dx: at.x - p.x, dy: at.y - p.y };
    svg.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const p = point(event);
    if (!p) return;
    const { x, y } = clamp({ x: p.x + drag.dx, y: p.y + drag.dy });
    if (drag.selection.kind === 'sensor') {
      const item = sensor();
      if (item && (item.x !== x || item.y !== y)) changeSensor(item, { x, y });
    } else {
      const item = wall();
      if (!item) return;
      if (drag.endpoint === 1 && (item.x1 !== x || item.y1 !== y)) changeWall(item, { x1: x, y1: y });
      if (drag.endpoint === 2 && (item.x2 !== x || item.y2 !== y)) changeWall(item, { x2: x, y2: y });
    }
  }
  const endDrag = (event: PointerEvent) => { if (event.pointerId === drag?.pointer) drag = undefined; };

  function numberField(label: () => string, value: () => number, change: (value: number) => boolean, max?: () => number) {
    return <label class={fieldClass}>{label()}
      <input class={inputClass} type="number" inputmode="decimal" step="any" min="0" max={max?.()} value={value()}
        onChange={(event) => { if (!change(event.currentTarget.valueAsNumber)) event.currentTarget.value = String(value()); }} />
    </label>;
  }
  const error = () => <Show when={issue()}>{(problem) => (
    <p class="text-sm text-destructive" role="alert">{t(`thermal.${problem().code}`, { field: problem().field })}</p>
  )}</Show>;
  function inspector() {
    return <div class="space-y-5">
      <section class="space-y-2">
        <h2 class="text-sm font-semibold">{t('thermal.dimensions')}</h2>
        <div class="grid grid-cols-2 gap-2">
          <For each={roomFields}>{(field) => numberField(() => t(`thermal.${field}`), () => room()[field], (n) => apply({ ...props.layout, room: { ...room(), [field]: n } }))}</For>
        </div>
      </section>
      <section class="space-y-2 border-t pt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{t('thermal.sensors')} · {props.layout.sensors.length}</h2>
          <Button variant="outline" size="sm" onClick={() => addSensor({ x: room().width / 2, y: room().depth / 2 })}>{t('thermal.addSensor')}</Button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.layout.sensors}>{(item) => <Button class="max-w-full" variant={selected('sensor', item.id) ? 'default' : 'outline'} size="sm" aria-pressed={selected('sensor', item.id)} onClick={() => { setIssue(undefined); props.onSelect({ kind: 'sensor', id: item.id }); }}><span class="truncate">{item.id}</span></Button>}</For>
        </div>
        <Show when={sensor()}>{(current) => <div class="space-y-2">
          <label class={fieldClass}>{t('thermal.sensorId')}
            <input class={inputClass} value={current().id} onChange={(event) => {
              if (!changeSensor(current(), { id: event.currentTarget.value })) event.currentTarget.value = current().id;
              else event.currentTarget.value = event.currentTarget.value.trim();
            }} />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <For each={sensorFields}>{(field) => numberField(() => t(`thermal.${field}`), () => current()[field], (n) => changeSensor(current(), { [field]: n }), () => room()[field === 'x' ? 'width' : field === 'y' ? 'depth' : 'height'])}</For>
          </div>
          <input class="w-full accent-primary" type="range" aria-label={t('thermal.z')} min={0} max={room().height} step="any" value={current().z} onInput={(event) => changeSensor(current(), { z: event.currentTarget.valueAsNumber })} />
          <div class="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => changeSensor(current(), { z: 0 })}>{t('thermal.floor')}</Button>
            <Button size="sm" variant="outline" onClick={() => changeSensor(current(), { z: Math.min(0.75, room().height) })}>{t('thermal.desk')}</Button>
            <Button size="sm" variant="outline" onClick={() => changeSensor(current(), { z: room().height })}>{t('thermal.ceiling')}</Button>
          </div>
          <Button size="sm" variant="destructive" onClick={() => props.onDelete({ kind: 'sensor', id: current().id })}>{t('thermal.delete')} {current().id}</Button>
        </div>}</Show>
      </section>
      <section class="space-y-2 border-t pt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{t('thermal.partitions')} · {props.layout.walls.length}</h2>
          <Button size="sm" variant="outline" onClick={() => { props.onSelect(); setIssue(undefined); setShowWallForm(true); }}>{t('thermal.addWall')}</Button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.layout.walls}>{(item) => <Button class="max-w-full" variant={selected('wall', item.id) ? 'default' : 'outline'} aria-pressed={selected('wall', item.id)} size="sm" onClick={() => { setShowWallForm(false); setIssue(undefined); props.onSelect({ kind: 'wall', id: item.id }); }}><span class="truncate">{item.id}</span></Button>}</For>
        </div>
        <Show when={showWallForm()}>
          <form class="space-y-2" onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const value = (key: string) => String(fields.get(key) ?? '').trim() ? Number(fields.get(key)) : NaN;
            addWall({ x1: value('x1'), y1: value('y1'), x2: value('x2'), y2: value('y2') });
          }}>
            <div class="grid grid-cols-2 gap-2"><For each={wallFields}>{(field) => <label class={fieldClass}>{t(`thermal.${field}`)}
              <input name={field} type="number" step="any" inputmode="decimal" class={inputClass} required />
            </label>}</For></div>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" type="submit">{t('thermal.addWall')}</Button>
              <Button size="sm" type="button" variant="outline" onClick={() => { setShowWallForm(false); setIssue(undefined); }}>{t('thermal.cancel')}</Button>
            </div>
          </form>
        </Show>
        <Show when={wall()}>{(current) => <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2"><For each={wallFields}>{(field) => numberField(() => t(`thermal.${field}`), () => current()[field], (n) => changeWall(current(), { [field]: n }), () => field[0] === 'x' ? room().width : room().depth)}</For></div>
          <Button size="sm" variant="destructive" onClick={() => props.onDelete({ kind: 'wall', id: current().id })}>{t('thermal.delete')} {current().id}</Button>
        </div>}</Show>
      </section>
      {error()}
    </div>;
  }

  return <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <section class="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label={t('thermal.plan')}>
      <div class="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div class="flex flex-wrap gap-1" role="group" aria-label={t('thermal.plan')}>
          <For each={[['select', IconPointer, 'select'], ['sensor', IconMapPin, 'sensor'], ['wall', IconLine, 'partition']] as const}>{([value, Icon, label]) => (
            <Button size="sm" variant={tool() === value ? 'default' : 'outline'} aria-pressed={tool() === value} onClick={() => { cancel(); setTool(value); }}><Icon class="size-4" aria-hidden="true" />{t(`thermal.${label}`)}</Button>
          )}</For>
        </div>
        <div class="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={props.onExport}><IconDownload class="size-4" aria-hidden="true" />{t('thermal.saveLayout')}</Button>
          <Button size="sm" variant="ghost" onClick={() => file.click()}><IconUpload class="size-4" aria-hidden="true" />{t('thermal.loadLayout')}</Button>
          <input ref={file} class="hidden" type="file" accept=".json,application/json" aria-label={t('thermal.loadLayout')} onChange={(event) => {
            const incoming = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (incoming) { cancel(); props.onImport(incoming); }
          }} />
        </div>
      </div>
      <svg ref={svg} role="img" aria-label={t('thermal.plan')} viewBox={`-37 -37 ${w() + 74} ${h() + 74}`}
        class="block h-[clamp(16rem,54vh,35rem)] w-full touch-none select-none bg-muted/35 text-foreground"
        onPointerDown={onPlanDown} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
        <defs><pattern id={gridID} width={project(1) >= 6 ? project(1) : 30} height={project(1) >= 6 ? project(1) : 30} patternUnits="userSpaceOnUse">
          <path d={`M ${project(1) >= 6 ? project(1) : 30} 0 H 0 V ${project(1) >= 6 ? project(1) : 30}`} fill="none" stroke="currentColor" stroke-opacity=".17" stroke-width="1" />
        </pattern></defs>
        <rect width={w()} height={h()} class="fill-background" />
        <rect width={w()} height={h()} fill={`url(#${gridID})`} stroke="currentColor" stroke-width="2" />
        <g fill="currentColor" opacity=".72" font-size="16" class="font-mono" pointer-events="none">
          <text x={w() / 2} y="-12" text-anchor="middle">X · {format(room().width)} m</text>
          <text transform={`translate(-12 ${h() / 2}) rotate(-90)`} text-anchor="middle">Y · {format(room().depth)} m</text>
          <text x="6" y="18" font-size="13">0, 0</text>
        </g>
        <For each={props.layout.walls}>{(item) => <g class={selected('wall', item.id) ? 'text-foreground' : 'text-muted-foreground'}>
          <line x1={project(item.x1)} y1={project(item.y1)} x2={project(item.x2)} y2={project(item.y2)} stroke="currentColor" stroke-width="4" pointer-events="none" />
          <For each={[1, 2] as const}>{(end) => {
            const at = () => ({ x: item[`x${end}`], y: item[`y${end}`] });
            return <g transform={`translate(${project(at().x)} ${project(at().y)})`}>
              <circle r="5" class="fill-background stroke-current" stroke-width="2" pointer-events="none" />
              <circle r="19" fill="transparent" class="cursor-grab" pointer-events={tool() === 'select' ? 'all' : 'none'} onPointerDown={(event) => startDrag(event, { kind: 'wall', id: item.id }, at(), end)} />
            </g>;
          }}</For>
        </g>}</For>
        <For each={props.layout.sensors}>{(item) => <g transform={`translate(${project(item.x)} ${project(item.y)})`}>
          <circle r="9" class={selected('sensor', item.id) ? 'fill-foreground stroke-background' : 'fill-background stroke-foreground'} stroke-width="2" pointer-events="none" />
          <text x="15" y="5" fill="currentColor" font-size="16" class="font-mono" pointer-events="none">{item.id.length > 18 ? `${item.id.slice(0, 17)}…` : item.id}</text>
          <circle r="22" fill="transparent" class="cursor-grab" pointer-events={tool() === 'select' ? 'all' : 'none'} onPointerDown={(event) => startDrag(event, { kind: 'sensor', id: item.id }, item)} />
        </g>}</For>
        <Show when={firstPoint()}>{(p) => <circle cx={project(p().x)} cy={project(p().y)} r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" pointer-events="none" />}</Show>
      </svg>
      <div class="flex min-h-12 flex-wrap items-center gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
        <p aria-live="polite">{t(tool() === 'select' ? 'thermal.selectHint' : tool() === 'sensor' ? 'thermal.sensorHint' : firstPoint() ? 'thermal.wallPending' : 'thermal.wallHint')}</p>
        <Show when={firstPoint()}><Button size="sm" variant="outline" onClick={cancel}>{t('thermal.cancel')}</Button></Show>
        <div class="w-full lg:hidden">{error()}</div>
      </div>
    </section>
    <Inspector title={t('thermal.inspector')} description={t('thermal.axes')}>{inspector}</Inspector>
  </div>;
}
