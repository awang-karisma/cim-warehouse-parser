import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Line, Scatter } from 'solid-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  IconArrowsMaximize,
  IconChartDots,
  IconChartLine,
  IconHandGrab,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-solidjs';
import { readPalette, useThemeSignal } from '~/components/chartSetup';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { DataloggerRecord, DataloggerSession } from '~/types';
import { getSessionColor } from './colors';
import type { RawRecord } from './types';

export interface ChartLayerStyle {
  color?: string;
  opacity?: number;
}

interface ZoomableTimeChartProps {
  sessions?: DataloggerSession[];
  recordsBySession?: Record<string, DataloggerRecord[]>;
  preview?: { name: string; records: RawRecord[] } | null;
  showHumidity: boolean;
  chartType?: 'line' | 'scatter';
  layerStyles?: Record<number, ChartLayerStyle>;
  heightClass?: string;
  emptyMessage?: string;
}

type Point = { x: number; y: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function ZoomableTimeChart(props: ZoomableTimeChartProps) {
  const isDark = useThemeSignal();

  let canvasContainerEl: HTMLDivElement | undefined;
  let hTrackEl: HTMLDivElement | undefined;
  let vTrackEl: HTMLDivElement | undefined;

  // Zoom levels: 1x = fit all. Up to 50x for dense multi-thousand point datasets.
  const [userZoomX, setUserZoomX] = createSignal(1);
  const [userZoomY, setUserZoomY] = createSignal(1);

  // Normalized scroll positions [0..1]
  // X: 0 = earliest data (left), 1 = latest data (right)
  // Y: 0 = highest temperatures (top), 1 = lowest temperatures (bottom)
  const [scrollProgX, setScrollProgX] = createSignal(0);
  const [scrollProgY, setScrollProgY] = createSignal(0);

  const [isPanning, setIsPanning] = createSignal(false);

  // Compute global data bounds & total plotted points across all active datasets
  const dataExtents = createMemo(() => {
    let totalPoints = 0;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let humMin = Infinity;
    let humMax = -Infinity;
    let hasHumidity = false;

    const visit = (ms: number, temp: number, hum: number | null | undefined) => {
      if (Number.isNaN(ms) || !Number.isFinite(temp)) return;
      totalPoints++;
      if (ms < xMin) xMin = ms;
      if (ms > xMax) xMax = ms;
      if (temp < yMin) yMin = temp;
      if (temp > yMax) yMax = temp;
      if (hum !== null && hum !== undefined && Number.isFinite(hum)) {
        hasHumidity = true;
        if (hum < humMin) humMin = hum;
        if (hum > humMax) humMax = hum;
      }
    };

    if (props.preview) {
      for (const r of props.preview.records) {
        visit(r.time.getTime(), r.temperature, r.humidity);
      }
    } else if (props.sessions && props.recordsBySession) {
      for (const s of props.sessions) {
        const recs = props.recordsBySession[String(s.id)] ?? [];
        for (const r of recs) {
          visit(new Date(r.timestamp).getTime(), r.temperature, r.humidity);
        }
      }
    }

    if (totalPoints === 0) {
      return {
        totalPoints: 0,
        xMin: 0,
        xMax: 0,
        yMin: 0,
        yMax: 0,
        xSpan: 0,
        ySpan: 0,
        humMin: 0,
        humMax: 100,
        humSpan: 100,
        hasHumidity: false,
      };
    }

    const rawXSpan = Math.max(60_000, xMax - xMin);
    const xPad = rawXSpan * 0.02;
    const rawYSpan = Math.max(1, yMax - yMin);
    const yPad = Math.max(0.5, rawYSpan * 0.08);
    const rawHumSpan = hasHumidity ? Math.max(5, humMax - humMin) : 100;
    const humPad = rawHumSpan * 0.08;

    const paddedXMin = xMin - xPad;
    const paddedXMax = xMax + xPad;
    const paddedYMin = yMin - yPad;
    const paddedYMax = yMax + yPad;
    const paddedHumMin = hasHumidity ? Math.max(0, humMin - humPad) : 0;
    const paddedHumMax = hasHumidity ? Math.min(100, humMax + humPad) : 100;

    return {
      totalPoints,
      xMin: paddedXMin,
      xMax: paddedXMax,
      yMin: paddedYMin,
      yMax: paddedYMax,
      xSpan: Math.max(60_000, paddedXMax - paddedXMin),
      ySpan: Math.max(1, paddedYMax - paddedYMin),
      humMin: paddedHumMin,
      humMax: paddedHumMax,
      humSpan: Math.max(5, paddedHumMax - paddedHumMin),
      hasHumidity,
    };
  });

  // Maximum zoom adapts to total plotted data points and temperature breadth
  const maxZoomX = createMemo(() => {
    const pts = dataExtents().totalPoints;
    return Math.max(10, Math.min(60, Math.ceil(pts / 30)));
  });

  const maxZoomY = createMemo(() => {
    const span = dataExtents().ySpan;
    return Math.max(10, Math.min(40, Math.ceil(span / 1.5)));
  });

  const isZoomed = createMemo(() => userZoomX() > 1.01 || userZoomY() > 1.01);

  // Visible window calculations based on zoom and scroll progress (0..1)
  const visibleBounds = createMemo(() => {
    const ext = dataExtents();
    if (ext.totalPoints === 0) {
      return {
        xMin: undefined,
        xMax: undefined,
        yMin: undefined,
        yMax: undefined,
        humMin: undefined,
        humMax: undefined,
      };
    }

    const zx = userZoomX();
    const zy = userZoomY();

    const winX = ext.xSpan / zx;
    const winY = ext.ySpan / zy;
    const winHum = ext.humSpan / zy;

    const maxPanX = ext.xSpan - winX;
    const maxPanY = ext.ySpan - winY;
    const maxPanHum = ext.humSpan - winHum;

    const vxMin = ext.xMin + scrollProgX() * maxPanX;
    const vxMax = vxMin + winX;

    // Y progression: 0 = highest temperatures at top, 1 = lowest temperatures at bottom
    const vyMax = ext.yMax - scrollProgY() * maxPanY;
    const vyMin = vyMax - winY;

    const vHumMax = ext.humMax - scrollProgY() * maxPanHum;
    const vHumMin = vHumMax - winHum;

    return {
      xMin: vxMin,
      xMax: vxMax,
      yMin: vyMin,
      yMax: vyMax,
      humMin: vHumMin,
      humMax: vHumMax,
    };
  });

  // Scrollbar thumb proportions (proportional to visible fraction 1 / zoom)
  const thumbWidthPct = createMemo(() => Math.max(8, Math.min(100, (1 / userZoomX()) * 100)));
  const thumbLeftPct = createMemo(() => scrollProgX() * (100 - thumbWidthPct()));

  const thumbHeightPct = createMemo(() => Math.max(8, Math.min(100, (1 / userZoomY()) * 100)));
  const thumbTopPct = createMemo(() => scrollProgY() * (100 - thumbHeightPct()));

  // Zoom control helpers
  const adjustZoomX = (delta: number) => {
    const next = clamp(Math.round((userZoomX() + delta) * 10) / 10, 1, maxZoomX());
    setUserZoomX(next);
    if (next <= 1.01) setScrollProgX(0);
  };

  const adjustZoomY = (delta: number) => {
    const next = clamp(Math.round((userZoomY() + delta) * 10) / 10, 1, maxZoomY());
    setUserZoomY(next);
    if (next <= 1.01) setScrollProgY(0);
  };

  const handleFitAll = () => {
    setUserZoomX(1);
    setUserZoomY(1);
    setScrollProgX(0);
    setScrollProgY(0);
  };

  const handleAutoDataZoom = () => {
    const pts = dataExtents().totalPoints;
    const recommendedX = clamp(Math.round(pts / 90), 1, maxZoomX());
    const recommendedY = clamp(Math.round(dataExtents().ySpan / 8), 1, maxZoomY());
    setUserZoomX(recommendedX);
    setUserZoomY(recommendedY);
    setScrollProgX(0);
    setScrollProgY(0);
  };

  // Mouse drag-to-pan directly on the chart canvas
  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!isZoomed() || !canvasContainerEl) return;

    setIsPanning(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startProgX = scrollProgX();
    const startProgY = scrollProgY();
    const cw = canvasContainerEl.clientWidth;
    const ch = canvasContainerEl.clientHeight;

    const onMove = (moveEv: MouseEvent) => {
      if (!canvasContainerEl) return;
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      if (userZoomX() > 1.01) {
        // Dragging left moves to later timestamps (scrollProgX increases)
        const dProgX = -dx / (cw * (userZoomX() - 1));
        setScrollProgX(clamp(startProgX + dProgX, 0, 1));
      }
      if (userZoomY() > 1.01) {
        // Dragging up moves to lower temperatures (scrollProgY increases)
        const dProgY = -dy / (ch * (userZoomY() - 1));
        setScrollProgY(clamp(startProgY + dProgY, 0, 1));
      }
    };

    const onUp = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Mouse wheel handling on the chart canvas:
  // - Ctrl/Meta/Alt + wheel: zooms in/out
  // - Regular wheel: pans vertically when vertically zoomed; pans horizontally when shift is held or trackpad scrolls horizontally
  // - When NOT zoomed, does not preventDefault so natural page scrolling remains unblocked!
  const handleCanvasWheel = (e: WheelEvent) => {
    // Zoom with modifier key
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      if (e.shiftKey) {
        setUserZoomY((z) => clamp(Math.round(z * zoomFactor * 10) / 10, 1, maxZoomY()));
      } else {
        setUserZoomX((z) => clamp(Math.round(z * zoomFactor * 10) / 10, 1, maxZoomX()));
        setUserZoomY((z) => clamp(Math.round(z * zoomFactor * 10) / 10, 1, maxZoomY()));
      }
      return;
    }

    // Direct pan with trackpad/wheel when zoomed
    const canPanY = userZoomY() > 1.01;
    const canPanX = userZoomX() > 1.01;

    if (canPanY && Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) {
      e.preventDefault();
      // Delta is normalized by zoom extent: single notch moves ~10% of visible slice
      const step = (e.deltaY / 400) / (userZoomY() - 1);
      setScrollProgY((p) => clamp(p + step, 0, 1));
    } else if (canPanX && (Math.abs(e.deltaX) > 0 || e.shiftKey)) {
      e.preventDefault();
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const step = (dx / 500) / (userZoomX() - 1);
      setScrollProgX((p) => clamp(p + step, 0, 1));
    }
  };

  // Horizontal scrollbar track drag
  const handleHTrackMouseDown = (e: MouseEvent) => {
    if (!hTrackEl || userZoomX() <= 1.01) return;
    const rect = hTrackEl.getBoundingClientRect();
    const trackWidth = rect.width;
    const thumbWidthPx = (thumbWidthPct() / 100) * trackWidth;
    const available = trackWidth - thumbWidthPx;
    if (available <= 0) return;

    const clickX = e.clientX - rect.left;
    const initialProg = clamp((clickX - thumbWidthPx / 2) / available, 0, 1);
    setScrollProgX(initialProg);

    const startX = e.clientX;
    const onMove = (moveEv: MouseEvent) => {
      const deltaX = moveEv.clientX - startX;
      setScrollProgX(clamp(initialProg + deltaX / available, 0, 1));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Vertical scrollbar track drag
  const handleVTrackMouseDown = (e: MouseEvent) => {
    if (!vTrackEl || userZoomY() <= 1.01) return;
    const rect = vTrackEl.getBoundingClientRect();
    const trackHeight = rect.height;
    const thumbHeightPx = (thumbHeightPct() / 100) * trackHeight;
    const available = trackHeight - thumbHeightPx;
    if (available <= 0) return;

    const clickY = e.clientY - rect.top;
    const initialProg = clamp((clickY - thumbHeightPx / 2) / available, 0, 1);
    setScrollProgY(initialProg);

    const startY = e.clientY;
    const onMove = (moveEv: MouseEvent) => {
      const deltaY = moveEv.clientY - startY;
      setScrollProgY(clamp(initialProg + deltaY / available, 0, 1));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  onCleanup(() => {
    // Safety cleanup of drag listeners
  });

  const buildDatasets = () => {
    const dark = isDark();
    const isScatter = props.chartType === 'scatter';
    const datasets: ChartData<'line', Point[]>['datasets'] = [];

    if (props.preview) {
      const colors = getSessionColor(0, dark);
      const recs = props.preview.records;
      datasets.push({
        label: `${props.preview.name} (°C)`,
        data: recs.map((r) => ({ x: r.time.getTime(), y: r.temperature })),
        borderColor: colors.stroke,
        backgroundColor: isScatter ? colors.stroke : colors.fill,
        borderWidth: 2,
        pointRadius: isScatter ? 3 : recs.length > 150 ? 0 : 2,
        pointHoverRadius: 4,
        showLine: !isScatter,
        tension: 0.15,
        yAxisID: 'y',
      });
      if (props.showHumidity && recs.some((r) => r.humidity !== null)) {
        datasets.push({
          label: `${props.preview.name} (%RH)`,
          data: recs
            .filter((r) => r.humidity !== null)
            .map((r) => ({ x: r.time.getTime(), y: r.humidity as number })),
          borderColor: colors.stroke,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: isScatter ? 2.5 : 0,
          showLine: !isScatter,
          tension: 0.15,
          yAxisID: 'y1',
        });
      }
      return { datasets };
    }

    const sessions = props.sessions ?? [];
    const map = props.recordsBySession ?? {};
    sessions.forEach((session, idx) => {
      const records = map[String(session.id)] ?? [];
      const style = props.layerStyles?.[session.id];
      const colors = getSessionColor(idx, dark, style?.opacity, style?.color);

      datasets.push({
        label: `${session.name} (°C)`,
        data: records.map((r) => ({ x: new Date(r.timestamp).getTime(), y: r.temperature })),
        borderColor: colors.stroke,
        backgroundColor: isScatter ? colors.stroke : colors.fill,
        borderWidth: 2,
        pointRadius: isScatter ? 3 : records.length > 150 ? 0 : 2,
        pointHoverRadius: 4,
        showLine: !isScatter,
        tension: 0.15,
        yAxisID: 'y',
      });

      if (props.showHumidity && records.some((r) => r.humidity !== null && r.humidity !== undefined)) {
        datasets.push({
          label: `${session.name} (%RH)`,
          data: records
            .filter((r) => r.humidity !== null && r.humidity !== undefined)
            .map((r) => ({ x: new Date(r.timestamp).getTime(), y: r.humidity as number })),
          borderColor: colors.stroke,
          backgroundColor: isScatter ? colors.fill : 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: isScatter ? 2.5 : 0,
          showLine: !isScatter,
          tension: 0.15,
          yAxisID: 'y1',
        });
      }
    });

    return { datasets };
  };

  const lineData = createMemo(() => buildDatasets() as ChartData<'line'>);
  const scatterData = createMemo(() => buildDatasets() as unknown as ChartData<'scatter'>);

  const buildOptions = () => {
    const palette = readPalette(isDark());
    const bounds = visibleBounds();
    const showRightAxis = props.showHumidity && dataExtents().hasHumidity;

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'start' as const,
          labels: {
            color: palette.foreground,
            usePointStyle: true,
            pointStyleWidth: 10,
            boxHeight: 8,
            padding: 12,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: palette.card,
          titleColor: palette.foreground,
          bodyColor: palette.foreground,
          borderColor: palette.border,
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          min: bounds.xMin,
          max: bounds.xMax,
          time: {
            tooltipFormat: 'yyyy-MM-dd HH:mm:ss',
            displayFormats: {
              minute: 'HH:mm',
              hour: 'MMM d HH:mm',
              day: 'MMM d',
            },
          },
          ticks: {
            color: palette.muted,
            maxRotation: 0,
            autoSkip: true,
          },
          grid: {
            color: palette.border,
          },
        },
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          min: bounds.yMin,
          max: bounds.yMax,
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: palette.muted,
          },
          ticks: {
            color: palette.muted,
            callback: (val: string | number) => `${Number(val).toFixed(1)}°C`,
          },
          grid: {
            color: palette.border,
          },
        },
        ...(showRightAxis
          ? {
              y1: {
                type: 'linear' as const,
                position: 'right' as const,
                min: bounds.humMin,
                max: bounds.humMax,
                title: {
                  display: true,
                  text: 'Humidity (%RH)',
                  color: palette.muted,
                },
                ticks: {
                  color: palette.muted,
                  callback: (val: string | number) => `${Number(val).toFixed(0)}%`,
                },
                grid: {
                  drawOnChartArea: false,
                },
              },
            }
          : {}),
      },
    };
  };

  const lineOptions = createMemo<ChartOptions<'line'>>(() => buildOptions());
  const scatterOptions = createMemo<ChartOptions<'scatter'>>(() => buildOptions());

  return (
    <div class="flex w-full min-w-0 flex-col space-y-2.5">
      {/* Zoom & Scroll Control Bar */}
      <Show when={dataExtents().totalPoints > 0}>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Time (X) Zoom */}
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Time Zoom</span>
              <Button
                size="icon"
                variant="outline"
                class="size-6"
                aria-label="Zoom out time axis"
                disabled={userZoomX() <= 1}
                onClick={() => adjustZoomX(-0.5)}
              >
                <IconZoomOut class="size-3.5" />
              </Button>
              <input
                type="range"
                aria-label="Time axis zoom"
                min={1}
                max={maxZoomX()}
                step={0.5}
                value={userZoomX()}
                onInput={(e) => setUserZoomX(clamp(Number(e.currentTarget.value), 1, maxZoomX()))}
                class="h-1.5 w-20 cursor-pointer accent-primary sm:w-24"
              />
              <Button
                size="icon"
                variant="outline"
                class="size-6"
                aria-label="Zoom in time axis"
                disabled={userZoomX() >= maxZoomX()}
                onClick={() => adjustZoomX(0.5)}
              >
                <IconZoomIn class="size-3.5" />
              </Button>
              <span class="w-9 font-mono text-[11px] tabular-nums text-foreground">
                {userZoomX().toFixed(1)}×
              </span>
            </div>

            {/* Vertical (Y) Zoom */}
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Vertical Zoom</span>
              <Button
                size="icon"
                variant="outline"
                class="size-6"
                aria-label="Zoom out vertical axis"
                disabled={userZoomY() <= 1}
                onClick={() => adjustZoomY(-0.5)}
              >
                <IconZoomOut class="size-3.5" />
              </Button>
              <input
                type="range"
                aria-label="Vertical axis zoom"
                min={1}
                max={maxZoomY()}
                step={0.5}
                value={userZoomY()}
                onInput={(e) => setUserZoomY(clamp(Number(e.currentTarget.value), 1, maxZoomY()))}
                class="h-1.5 w-20 cursor-pointer accent-primary sm:w-24"
              />
              <Button
                size="icon"
                variant="outline"
                class="size-6"
                aria-label="Zoom in vertical axis"
                disabled={userZoomY() >= maxZoomY()}
                onClick={() => adjustZoomY(0.5)}
              >
                <IconZoomIn class="size-3.5" />
              </Button>
              <span class="w-9 font-mono text-[11px] tabular-nums text-foreground">
                {userZoomY().toFixed(1)}×
              </span>
            </div>

            <Show when={isZoomed()}>
              <div class="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <IconHandGrab class="size-3.5" />
                <span>Drag canvas or wheel to pan</span>
              </div>
            </Show>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
              {visibleBounds().yMin !== undefined && visibleBounds().yMax !== undefined
                ? `${visibleBounds().yMin!.toFixed(1)}°–${visibleBounds().yMax!.toFixed(1)}°C`
                : ''}
              {' · '}
              {dataExtents().totalPoints.toLocaleString()} pts
            </span>

            <Show when={dataExtents().totalPoints > 200}>
              <Button
                size="sm"
                variant="outline"
                class="h-6 px-2 text-[11px]"
                onClick={handleAutoDataZoom}
                title="Automatically zoom to display dense readings legibly"
              >
                Auto Zoom
              </Button>
            </Show>

            <Button
              size="sm"
              variant={isZoomed() ? 'secondary' : 'outline'}
              class="h-6 px-2 text-[11px]"
              onClick={handleFitAll}
              disabled={!isZoomed()}
            >
              <IconArrowsMaximize class="size-3" />
              Fit All
            </Button>
          </div>
        </div>
      </Show>

      {/* Main Chart Area: Canvas taking 100% available horizontal space + Vertical Scrollbar alongside */}
      <Show
        when={dataExtents().totalPoints > 0}
        fallback={
          <div
            class={`flex w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground ${
              props.heightClass ?? 'h-[400px]'
            }`}
          >
            {props.emptyMessage ?? 'No data points in the selected range.'}
          </div>
        }
      >
        <div class="flex w-full min-w-0 items-stretch gap-1.5 rounded-md border bg-card p-3">
          {/* Chart Canvas expands to fill 100% of the available width */}
          <div
            ref={canvasContainerEl}
            onMouseDown={handleCanvasMouseDown}
            onWheel={handleCanvasWheel}
            data-testid="zoomable-chart-canvas"
            class={`relative flex-1 min-w-0 ${props.heightClass ?? 'h-[420px]'} ${
              isZoomed() ? (isPanning() ? 'cursor-grabbing' : 'cursor-grab') : ''
            }`}
          >
            <Show
              when={props.chartType === 'scatter'}
              fallback={<Line data={lineData()} options={lineOptions()} />}
            >
              <Scatter data={scatterData()} options={scatterOptions()} />
            </Show>
          </div>

          {/* Vertical Temperature Scrollbar (always sits alongside Y-axis) */}
          <div
            ref={vTrackEl}
            onMouseDown={handleVTrackMouseDown}
            class="relative flex w-4 select-none flex-col items-center justify-between rounded bg-muted/40 transition-colors hover:bg-muted/70 cursor-pointer"
            title="Vertical Temperature Scroll"
          >
            {/* Top / Higher temp button */}
            <button
              type="button"
              aria-label="Scroll to higher temperatures"
              class="flex size-4 items-center justify-center text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setScrollProgY((p) => clamp(p - 0.1, 0, 1));
              }}
            >
              ▲
            </button>

            {/* Draggable vertical thumb */}
            <div class="relative w-full flex-1">
              <div
                class={`absolute left-0.5 right-0.5 rounded-full transition-colors ${
                  userZoomY() > 1.01 ? 'bg-primary/70 hover:bg-primary' : 'bg-muted-foreground/30'
                }`}
                style={{
                  top: `${thumbTopPct()}%`,
                  height: `${thumbHeightPct()}%`,
                  'min-height': '14px',
                }}
              />
            </div>

            {/* Bottom / Lower temp button */}
            <button
              type="button"
              aria-label="Scroll to lower temperatures"
              class="flex size-4 items-center justify-center text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setScrollProgY((p) => clamp(p + 0.1, 0, 1));
              }}
            >
              ▼
            </button>
          </div>
        </div>

        {/* Horizontal Time Scrollbar (sits below chart along X-axis timeline) */}
        <div class="flex items-center gap-2 px-1">
          <div
            ref={hTrackEl}
            onMouseDown={handleHTrackMouseDown}
            class="relative flex h-4 flex-1 select-none items-center justify-between rounded bg-muted/40 transition-colors hover:bg-muted/70 cursor-pointer"
            title="Timeline Time Scroll"
          >
            {/* Left / Earlier time button */}
            <button
              type="button"
              aria-label="Scroll timeline earlier"
              class="flex size-4 items-center justify-center text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setScrollProgX((p) => clamp(p - 0.1, 0, 1));
              }}
            >
              ◄
            </button>

            {/* Draggable horizontal thumb */}
            <div class="relative h-full flex-1">
              <div
                class={`absolute bottom-0.5 top-0.5 rounded-full transition-colors ${
                  userZoomX() > 1.01 ? 'bg-primary/70 hover:bg-primary' : 'bg-muted-foreground/30'
                }`}
                style={{
                  left: `${thumbLeftPct()}%`,
                  width: `${thumbWidthPct()}%`,
                  'min-width': '20px',
                }}
              />
            </div>

            {/* Right / Later time button */}
            <button
              type="button"
              aria-label="Scroll timeline later"
              class="flex size-4 items-center justify-center text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setScrollProgX((p) => clamp(p + 0.1, 0, 1));
              }}
            >
              ►
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
