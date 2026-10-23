import { type Component, For, Show, createMemo } from 'solid-js';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

export interface DeliveryDateBadgesProps {
  date?: string | null;
  quantity?: string | number | null;
  class?: string;
  badgeClass?: string;
}
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function normalizeDeliveryDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '-') return '-';

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    return '-';
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      const yStr = String(y).padStart(4, '0');
      const mStr = String(m).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }
    return '-';
  }

  return '-';
}


export function formatDeliveryDateOnly(dateStr: string): string {
  const trimmed = dateStr.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
  }
  return trimmed;
}

export function parseDeliveryBadges(
  rawDate?: string | null,
  explicitQty?: string | number | null,
): string[] {
  if (rawDate === undefined || rawDate === null) return [];
  const trimmed = String(rawDate).trim();
  if (!trimmed || trimmed === '-') return [];

  // When explicit quantity is passed (e.g. from single-shipment DeliveryItem rows)
  if (explicitQty !== undefined && explicitQty !== null && String(explicitQty).trim() !== '') {
    const rawQty = String(explicitQty).trim();
    const qtyMatch = rawQty.match(/([0-9]+(?:[.,][0-9]+)?)/);
    const qty = qtyMatch ? qtyMatch[1].replace(',', '.') : '';
    const formatted = formatDeliveryDateOnly(trimmed);
    return [qty ? `${formatted} (${qty})` : formatted];
  }

  // Parse shipment entries: date + optional parenthesized numeric quantity (ignoring unit text)
  // Supports DD/MM/YYYY or YYYY-MM-DD
  const entryRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})(?:\s*\(\s*([0-9]+(?:[.,][0-9]+)?)\s*[^)]*\))?/g;
  const badges: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(trimmed)) !== null) {
    const dateStr = formatDeliveryDateOnly(match[1]);
    const qty = match[2] ? match[2].replace(',', '.') : '';
    badges.push(qty ? `${dateStr} (${qty})` : dateStr);
  }

  if (badges.length > 0) {
    return badges;
  }

  // Preserve non-empty unparseable legacy/freeform text as a single badge
  return [trimmed];
}

export const DeliveryDateBadges: Component<DeliveryDateBadgesProps> = (props) => {
  const badges = createMemo(() => parseDeliveryBadges(props.date, props.quantity));

  return (
    <Show
      when={badges().length > 0}
      fallback={<span class={cn('text-muted-foreground', props.class)}>-</span>}
    >
      <div class={cn('flex flex-wrap items-center gap-1.5', props.class)}>
        <For each={badges()}>
          {(badgeText) => (
            <Badge
              variant="secondary"
              class={cn('font-mono text-xs font-medium', props.badgeClass)}
            >
              {badgeText}
            </Badge>
          )}
        </For>
      </div>
    </Show>
  );
};
