import type { DataloggerRecord } from '~/types';

export type Unit = 'C' | 'F';
export interface Series {
  times: Float64Array;
  values: Float64Array;
}

export interface ThermalData {
  bySensor: ReadonlyMap<string, Series>;
  timeline: Float64Array;
  min: number | undefined;
  max: number | undefined;
}

export type Provenance = 'observed' | 'interpolated' | 'unavailable';
export interface Reading {
  value: number;
  status: Provenance;
}

export interface SessionPreview {
  series: Series;
  skipped: number;
  duplicates: number;
}

export interface ChannelMapping {
  sensor: string;
  unit: Unit;
}

export function pendingSessionIDs(query: string): number[] {
  const ids = new Set<number>();
  for (const id of query.split(',')) {
    if (!/^\d+$/.test(id.trim())) continue;
    const n = Number(id);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

export function previewSession(records: readonly DataloggerRecord[], unit: Unit): SessionPreview {
  const samples = new Map<number, number>();
  let skipped = 0;
  let duplicates = 0;
  for (const record of records) {
    const time = Date.parse(record.timestamp);
    const temp = unit === 'F' ? (record.temperature - 32) * (5 / 9) : record.temperature;
    if (!Number.isFinite(time) || !Number.isFinite(temp)) {
      skipped++;
      continue;
    }
    if (samples.has(time)) duplicates++;
    samples.set(time, temp);
  }
  const sorted = Float64Array.from(samples.keys()).sort();
  return { series: { times: sorted, values: sorted.map((time) => samples.get(time)!) }, skipped, duplicates };
}

export function buildThermalData(bySensor: ReadonlyMap<string, Series>): ThermalData {
  const union = new Set<number>();
  let min = Infinity;
  let max = -Infinity;
  for (const series of bySensor.values()) {
    for (let i = 0; i < series.times.length; i++) {
      union.add(series.times[i]);
      min = Math.min(min, series.values[i]);
      max = Math.max(max, series.values[i]);
    }
  }
  return { bySensor, timeline: Float64Array.from(union).sort(), min: union.size ? min : undefined, max: union.size ? max : undefined };
}

export function indexAtOrBefore(times: Float64Array, time: number): number {
  let start = 0, end = times.length;
  while (start < end) {
    const mid = start + Math.floor((end - start) / 2);
    if (times[mid] <= time) start = mid + 1;
    else end = mid;
  }
  return start - 1;
}

export function readSample(series: Series | undefined, time: number | undefined, out: Reading): void {
  if (series && time !== undefined) {
    const index = indexAtOrBefore(series.times, time);
    if (index >= 0) {
      const left = series.times[index];
      if (left === time) {
        out.value = series.values[index];
        out.status = 'observed';
        return;
      }
      if (index + 1 < series.times.length) {
        const fraction = (time - left) / (series.times[index + 1] - left);
        out.value = series.values[index] * (1 - fraction) + series.values[index + 1] * fraction;
        out.status = 'interpolated';
        return;
      }
    }
  }
  out.value = NaN;
  out.status = 'unavailable';
}
