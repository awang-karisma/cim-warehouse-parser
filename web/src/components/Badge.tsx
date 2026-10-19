import { type Component } from 'solid-js';
import { Badge as UiBadge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

export type BadgeKind = 'order' | 'item' | 'sync';

interface BadgeProps {
  status: string;
  kind?: BadgeKind;
  pill?: boolean;
  class?: string;
}

export const Badge: Component<BadgeProps> = (props) => {
  const upper = () => (props.status ? props.status.trim().toUpperCase() : '');
  const colorClass = () => {
    const s = upper();
    if (!s || s === '-') {
      return 'bg-muted text-muted-foreground border-transparent';
    }

    if (props.kind === 'item') {
      if (s === 'PROSES ORDER') {
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
      }
      if (s === 'STOK GUDANG') {
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
      }
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    }

    if (props.kind === 'sync') {
      if (['SUCCESS', 'COMPLETED', 'OK'].includes(s)) {
        return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
      }
      if (['SYNCING', 'PROSES', 'IN_PROGRESS'].includes(s)) {
        return 'bg-status-proses/15 text-status-proses border-status-proses/30';
      }
      if (['FAILED', 'ERROR'].includes(s)) {
        return 'bg-status-batal/15 text-status-batal border-status-batal/30';
      }
      return 'bg-muted text-muted-foreground border-transparent';
    }

    // Default / order status
    if (['SELESAI', 'SUCCESS', 'COMPLETED', 'READY', 'DONE'].includes(s)) {
      return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
    }
    if (['PROSES', 'PARTIAL'].includes(s)) {
      return 'bg-status-proses/15 text-status-proses border-status-proses/30';
    }
    if (s === 'BELUM SELESAI') {
      return 'bg-status-belum-selesai/15 text-status-belum-selesai border-status-belum-selesai/30';
    }
    if (s === 'PENDING') {
      return 'bg-status-pending/15 text-status-pending border-status-pending/30';
    }
    if (['BATAL', 'CANCEL'].includes(s)) {
      return 'bg-status-batal/15 text-status-batal border-status-batal/30';
    }
    return 'bg-muted text-muted-foreground border-transparent';
  };

  return (
    <UiBadge
      variant="outline"
      round={props.pill}
      class={cn('font-semibold uppercase tracking-wide text-[11px]', colorClass(), props.class)}
    >
      {props.status || '-'}
    </UiBadge>
  );
};
