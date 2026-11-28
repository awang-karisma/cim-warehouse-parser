import { type Component, createMemo, For } from 'solid-js';
import { ORDER_STATUS } from '~/domain';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip';

export interface StatusSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export function computeStatusSegments(counts?: Record<string, number>): {
  total: number;
  items: StatusSegment[];
} {
  const c = counts || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (total === 0) return { total: 0, items: [] };

  const selesai = (c[ORDER_STATUS.COMPLETE] || 0) + (c.COMPLETED || 0);
  const proses = (c[ORDER_STATUS.PROCESSING] || 0) + (c.PARTIAL || 0);
  const belumSelesai = c[ORDER_STATUS.UNFINISHED] || 0;
  const batal = (c[ORDER_STATUS.CANCELLED] || 0) + (c[ORDER_STATUS.CANCEL] || 0);
  const pending = Math.max(0, total - selesai - proses - belumSelesai - batal);

  const items = [
    { label: 'Selesai', count: selesai, pct: Math.round((selesai / total) * 100), color: 'var(--color-status-selesai, #10b981)' },
    { label: 'Proses', count: proses, pct: Math.round((proses / total) * 100), color: 'var(--color-status-proses, #f59e0b)' },
    { label: 'Belum Selesai', count: belumSelesai, pct: Math.round((belumSelesai / total) * 100), color: 'var(--color-status-belum-selesai, #eab308)' },
    { label: 'Pending', count: pending, pct: Math.round((pending / total) * 100), color: 'var(--color-status-pending, #a855f7)' },
    { label: 'Batal', count: batal, pct: Math.round((batal / total) * 100), color: 'var(--color-status-batal, #ef4444)' },
  ].filter((s) => s.count > 0);

  return { total, items };
}

export const MiniStatusBreakdown: Component<{ counts?: Record<string, number>; disableTooltip?: boolean }> = (props) => {
  const segments = createMemo(() => computeStatusSegments(props.counts));

  const bar = () => (
    <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
      <For each={segments().items}>
        {(item) => (
          <div
            class="h-full transition-all duration-200"
            style={{ width: `${item.pct}%`, 'background-color': item.color }}
          />
        )}
      </For>
    </div>
  );

  if (props.disableTooltip) {
    return <div class="w-full min-w-[120px]">{bar()}</div>;
  }

  return (
    <Tooltip>
      <TooltipTrigger as="div" class="w-full min-w-[120px] cursor-pointer">
        {bar()}
      </TooltipTrigger>
      <TooltipContent class="p-2 text-xs space-y-1">
        <For each={segments().items}>
          {(item) => (
            <div class="flex items-center gap-1.5">
              <span class="size-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span>
                {item.label}: {item.count} ({item.pct}%)
              </span>
            </div>
          )}
        </For>
      </TooltipContent>
    </Tooltip>
  );
};
