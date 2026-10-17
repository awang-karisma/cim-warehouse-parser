import { type Component, createMemo } from 'solid-js';

interface StatusBarProps {
  statusCounts?: Record<string, number>;
  height?: number;
}

export const StatusBar: Component<StatusBarProps> = (props) => {
  const segments = createMemo(() => {
    const counts = props.statusCounts || {};
    const total = Object.values(counts).reduce((acc, c) => acc + c, 0);
    if (total === 0) return [];

    let selesai = 0;
    let proses = 0;
    let pending = 0;

    for (const [k, v] of Object.entries(counts)) {
      const upper = k.toUpperCase();
      if (upper === 'SELESAI' || upper === 'COMPLETED') {
        selesai += v;
      } else if (upper === 'PROSES' || upper === 'PARTIAL') {
        proses += v;
      } else {
        pending += v;
      }
    }

    const pctSelesai = Math.round((selesai / total) * 100);
    const pctProses = Math.round((proses / total) * 100);
    const pctPending = Math.max(0, 100 - pctSelesai - pctProses);

    return [
      { label: `SELESAI (${pctSelesai}%)`, width: pctSelesai, bg: 'var(--success)' },
      { label: `PROSES (${pctProses}%)`, width: pctProses, bg: 'var(--warning)' },
      { label: `PENDING (${pctPending}%)`, width: pctPending, bg: 'var(--danger)' },
    ].filter((s) => s.width > 0);
  });

  return (
    <div
      class="stacked-bar"
      style={{ height: `${props.height || 28}px` }}
    >
      {segments().map((seg) => (
        <div
          class="bar-segment"
          style={{ width: `${seg.width}%`, 'background-color': seg.bg }}
          title={seg.label}
        >
          {seg.width >= 12 ? seg.label : ''}
        </div>
      ))}
    </div>
  );
};
