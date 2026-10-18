import { type Component } from 'solid-js';
import { Badge as UiBadge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

interface BadgeProps {
  status: string;
  pill?: boolean;
  class?: string;
}

export const Badge: Component<BadgeProps> = (props) => {
  const upper = () => (props.status ? props.status.toUpperCase() : '');
  const colorClass = () => {
    const s = upper();
    if (['SELESAI', 'SUCCESS', 'COMPLETED', 'READY', 'DONE'].includes(s)) {
      return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
    }
    if (['PROSES', 'PARTIAL', 'SYNCING'].includes(s)) {
      return 'bg-status-proses/15 text-status-proses border-status-proses/30';
    }
    if (['BATAL', 'CANCEL'].includes(s)) {
      return 'bg-status-batal/15 text-status-batal border-status-batal/30';
    }
    if (['PENDING', 'ERROR', 'FAILED', 'STOK KOSONG'].includes(s)) {
      return 'bg-status-pending/15 text-status-pending border-status-pending/30';
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
