import type { DataloggerRecord, DataloggerSession } from '~/types';
import type { SessionStats } from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTimeShort(iso: string | Date): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof iso === 'string' ? iso : '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateTimeFull(iso: string | Date): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof iso === 'string' ? iso : '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDateTimeInputValue(iso: string | Date): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatRelativeAgo(iso: string): string {
  if (!iso) return '—';
  // SQLite datetime('now') produces 'YYYY-MM-DD HH:MM:SS' in UTC
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function filterRecordsByRange(
  records: DataloggerRecord[],
  fromInput: string,
  toInput: string,
): DataloggerRecord[] {
  const fromMs = fromInput ? new Date(fromInput).getTime() : Number.NEGATIVE_INFINITY;
  const toMs = toInput ? new Date(toInput).getTime() : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) return records;

  return records.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    if (Number.isNaN(t)) return true;
    if (Number.isFinite(fromMs) && t < fromMs) return false;
    if (Number.isFinite(toMs) && t > toMs) return false;
    return true;
  });
}

export function computeSessionStats(
  session: DataloggerSession,
  records: DataloggerRecord[],
): SessionStats {
  if (records.length === 0) {
    return {
      sessionId: session.id,
      name: session.name,
      deviceModel: session.device_model || 'CSV Import',
      count: 0,
      tempMin: null,
      tempMax: null,
      tempAvg: null,
      humMin: null,
      humMax: null,
      humAvg: null,
      startTime: session.start_time,
      endTime: session.end_time,
      durationMs: 0,
    };
  }

  let tempMin = Infinity;
  let tempMax = -Infinity;
  let tempSum = 0;

  let humMin = Infinity;
  let humMax = -Infinity;
  let humSum = 0;
  let humCount = 0;

  let minMs = Infinity;
  let maxMs = -Infinity;
  let startTime = records[0].timestamp;
  let endTime = records[records.length - 1].timestamp;

  for (const r of records) {
    if (r.temperature < tempMin) tempMin = r.temperature;
    if (r.temperature > tempMax) tempMax = r.temperature;
    tempSum += r.temperature;

    if (r.humidity !== null && r.humidity !== undefined) {
      if (r.humidity < humMin) humMin = r.humidity;
      if (r.humidity > humMax) humMax = r.humidity;
      humSum += r.humidity;
      humCount++;
    }

    const ms = new Date(r.timestamp).getTime();
    if (!Number.isNaN(ms)) {
      if (ms < minMs) {
        minMs = ms;
        startTime = r.timestamp;
      }
      if (ms > maxMs) {
        maxMs = ms;
        endTime = r.timestamp;
      }
    }
  }

  return {
    sessionId: session.id,
    name: session.name,
    deviceModel: session.device_model || 'CSV Import',
    count: records.length,
    tempMin,
    tempMax,
    tempAvg: tempSum / records.length,
    humMin: humCount > 0 ? humMin : null,
    humMax: humCount > 0 ? humMax : null,
    humAvg: humCount > 0 ? humSum / humCount : null,
    startTime,
    endTime,
    durationMs: Number.isFinite(minMs) && Number.isFinite(maxMs) ? Math.max(0, maxMs - minMs) : 0,
  };
}
