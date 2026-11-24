import type { DataloggerSession } from '~/types';

export interface SessionDateFilterState {
  mode: 'single' | 'range';
  singleDate: string; // YYYY-MM-DD
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  query: string;
}

export function createEmptyDateFilter(): SessionDateFilterState {
  return {
    mode: 'single',
    singleDate: '',
    fromDate: '',
    toDate: '',
    query: '',
  };
}

function parseLocalDateStart(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseLocalDateEnd(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Converts UI date filter into RFC3339 UTC bounds for GET /api/v1/datalogger/sessions.
 */
export function dateFilterToApiBounds(filter: SessionDateFilterState): { from?: string; to?: string } {
  const fromYmd = filter.mode === 'single' ? filter.singleDate : filter.fromDate;
  const toYmd = filter.mode === 'single' ? filter.singleDate : filter.toDate;
  const fromMs = fromYmd ? parseLocalDateStart(fromYmd) : null;
  const toMs = toYmd ? parseLocalDateEnd(toYmd) : null;
  return {
    from: fromMs !== null ? new Date(fromMs).toISOString() : undefined,
    to: toMs !== null ? new Date(toMs).toISOString() : undefined,
  };
}

/**
 * Inclusive interval overlap filter:
 * A session [start_time, end_time] matches [filterStart, filterEnd] iff
 *   sessionEnd >= filterStart AND sessionStart <= filterEnd.
 * Example: filter = 2026-11-10 -> sessions spanning Oct 1..Nov 12 AND Nov 10..Dec 1 both match.
 */
export function filterSessionsInclusive(
  sessions: DataloggerSession[],
  filter: SessionDateFilterState,
): DataloggerSession[] {
  const q = filter.query.trim().toLowerCase();
  const fromYmd = filter.mode === 'single' ? filter.singleDate : filter.fromDate;
  const toYmd = filter.mode === 'single' ? filter.singleDate : filter.toDate;
  const filterStart = fromYmd ? parseLocalDateStart(fromYmd) : null;
  const filterEnd = toYmd ? parseLocalDateEnd(toYmd) : null;
  const hasDateFilter = filterStart !== null || filterEnd !== null;

  return sessions.filter((s) => {
    if (q) {
      const hay = `${s.name} ${s.device_model} ${s.serial_number}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (hasDateFilter) {
      if (!s.start_time || !s.end_time) return false;
      const sessStart = new Date(s.start_time).getTime();
      const sessEnd = new Date(s.end_time).getTime();
      if (Number.isNaN(sessStart) || Number.isNaN(sessEnd)) return false;

      if (filterStart !== null && sessEnd < filterStart) return false;
      if (filterEnd !== null && sessStart > filterEnd) return false;
    }

    return true;
  });
}

export function hasActiveSessionFilter(filter: SessionDateFilterState): boolean {
  if (filter.query.trim().length > 0) return true;
  if (filter.mode === 'single') return filter.singleDate.length > 0;
  return filter.fromDate.length > 0 || filter.toDate.length > 0;
}
