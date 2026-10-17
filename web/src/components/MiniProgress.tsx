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

  const color = createMemo(() => {
    const p = percent();
    if (p >= 100) return 'var(--success)';
    if (p > 0) return 'var(--warning)';
    return 'var(--danger)';
  });

  return (
    <div class="mini-progress-wrapper">
      <div class="mini-progress-bg">
        <div
          class="mini-progress-fill"
          style={{ width: `${percent()}%`, 'background-color': color() }}
        />
      </div>
      <span class="mini-progress-text">{percent()}%</span>
    </div>
  );
};
