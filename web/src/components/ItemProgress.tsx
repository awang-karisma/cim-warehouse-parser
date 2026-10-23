import { type Component, createMemo } from 'solid-js';

interface ItemProgressProps {
  terkirim: string | number;
  total: string | number;
  class?: string;
}

export const ItemProgress: Component<ItemProgressProps> = (props) => {
  const percent = createMemo(() => {
    const t = parseFloat(String(props.total)) || 0;
    const sent = parseFloat(String(props.terkirim)) || 0;
    if (t <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((sent / t) * 100)));
  });

  const barColor = createMemo(() => {
    const p = percent();
    if (p >= 100) return 'bg-status-selesai';
    if (p > 0) return 'bg-status-proses';
    return 'bg-status-pending';
  });

  return (
    <div class={`flex items-center gap-2 ${props.class || ''}`}>
      <div class="flex-1 h-2 bg-secondary rounded-full overflow-hidden min-w-[60px]">
        <div
          class={`h-full rounded-full transition-all duration-300 ${barColor()}`}
          style={{ width: `${percent()}%` }}
        />
      </div>
      <span class="text-xs font-semibold w-8 text-right text-muted-foreground">{percent()}%</span>
    </div>
  );
};
