import { type Component, createMemo } from 'solid-js';

interface StatusBarProps {
  statusCounts?: Record<string, number>;
  height?: number;
}

interface Segment {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export const StatusBar: Component<StatusBarProps> = (props) => {
  const data = createMemo(() => {
    const counts = props.statusCounts || {};
    const total = Object.values(counts).reduce((acc, c) => acc + c, 0);
    if (total === 0) return { total: 0, segments: [] };

    let selesai = 0;
    let proses = 0;
    let batal = 0;
    let pending = 0;

    for (const [k, v] of Object.entries(counts)) {
      const upper = k ? k.toUpperCase() : '';
      if (upper === 'SELESAI' || upper === 'COMPLETED') {
        selesai += v;
      } else if (upper === 'PROSES' || upper === 'PARTIAL') {
        proses += v;
      } else if (upper === 'BATAL' || upper === 'CANCEL') {
        batal += v;
      } else {
        pending += v;
      }
    }

    const pctSelesai = Math.round((selesai / total) * 100);
    const pctProses = Math.round((proses / total) * 100);
    const pctBatal = Math.round((batal / total) * 100);
    const pctPending = Math.max(0, 100 - pctSelesai - pctProses - pctBatal);

    const segments: Segment[] = [
      { key: 'SELESAI', label: 'SELESAI', count: selesai, pct: pctSelesai, color: 'var(--color-status-selesai, #2ec4b6)' },
      { key: 'PROSES', label: 'PROSES', count: proses, pct: pctProses, color: 'var(--color-status-proses, #ff9f1c)' },
      { key: 'PENDING', label: 'PENDING', count: pending, pct: pctPending, color: 'var(--color-status-pending, #e63946)' },
      { key: 'BATAL', label: 'BATAL', count: batal, pct: pctBatal, color: 'var(--color-status-batal, #6c757d)' },
    ];

    return { total, segments };
  });

  const activeSegments = createMemo(() => data().segments.filter((s) => s.count > 0));

  return (
    <div class="relative group my-1">
      <div
        class="flex w-full rounded-md overflow-hidden bg-gray-200"
        style={{ height: `${props.height || 28}px` }}
      >
        {activeSegments().map((seg) => (
          <div
            class="h-full transition-all duration-300"
            style={{ width: `${seg.pct}%`, 'background-color': seg.color }}
          />
        ))}
      </div>

      {activeSegments().length > 0 && (
        <div class="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 bg-surface text-text border border-border shadow-lg rounded-lg p-3 min-w-[200px] text-xs">
          <div class="font-semibold text-muted text-[11px] mb-2 uppercase tracking-wider">
            Status Breakdown ({data().total} total)
          </div>
          <div class="space-y-1.5">
            {activeSegments().map((seg) => (
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
                <span>{seg.label}</span>
                <span class="ml-auto font-semibold">{seg.count}</span>
                <span class="text-muted">({seg.pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
