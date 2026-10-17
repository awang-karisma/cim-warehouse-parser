import { type Component, createMemo } from 'solid-js';

interface MiniProgressProps {
  terkirim: string | number;
  total: string | number;
}

export const MiniProgress: Component<MiniProgressProps> = (props) => {
  const percent = createMemo(() => {
    const t = parseFloat(String(props.total)) || 0;
    const sent = parseFloat(String(props.terkirim)) || 0;
    if (t <= 0) return 100;
    const p = Math.round((sent / t) * 100);
    return Math.min(100, Math.max(0, p));
  });

  const colorClass = createMemo(() => {
    const p = percent();
    if (p >= 100) return 'bg-status-selesai';
    if (p > 0) return 'bg-status-proses';
    return 'bg-status-pending';
  });

  return (
    <div class="flex items-center gap-2">
      <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-12">
        <div
          class={`h-full rounded-full transition-all duration-300 ${colorClass()}`}
          style={{ width: `${percent()}%` }}
        />
      </div>
      <span class="text-xs font-semibold w-9 text-right text-muted">{percent()}%</span>
    </div>
  );
};
