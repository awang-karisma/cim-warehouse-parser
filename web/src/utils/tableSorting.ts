export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: string;
  direction: SortDirection;
}

function dateValue(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const raw = value.trim();
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (match) {
    const [, day, month, year] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }
  const iso = Date.parse(raw);
  return Number.isNaN(iso) ? undefined : iso;
}

export function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftDate = dateValue(left);
  const rightDate = dateValue(right);
  if (leftDate !== undefined && rightDate !== undefined) return leftDate - rightDate;
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true });
}

export function sortRows<T>(rows: readonly T[], state: SortState, valueFor: (row: T, field: string) => unknown): T[] {
  const direction = state.direction === 'asc' ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const result = compareValues(valueFor(a.row, state.field), valueFor(b.row, state.field)) * direction;
    return result || a.index - b.index;
  }).map(({ row }) => row);
}

export function nextSortState(current: SortState, field: string): SortState {
  return { field, direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc' };
}
