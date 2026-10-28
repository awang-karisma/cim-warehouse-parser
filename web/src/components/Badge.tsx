import { type Component } from 'solid-js';
import { Badge as UiBadge } from '~/components/ui/badge';
import { useI18n } from '~/i18n';
import { cn } from '~/lib/utils';

export type BadgeKind = 'order' | 'item' | 'sync';

interface BadgeProps {
  status: string;
  kind?: BadgeKind;
  pill?: boolean;
  class?: string;
}

export const Badge: Component<BadgeProps> = (props) => {
  const { t } = useI18n();
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
      if (s === 'DONE') {
        return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
      }
      if (s === 'DELIVERY VENDOR') {
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
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

  const label = () => {
    const raw = props.status;
    if (!raw || raw === '-') return '-';
    const s = raw.trim().toUpperCase();
    switch (s) {
      case 'SELESAI': return t('status.selesai');
      case 'BELUM SELESAI': return t('status.belumSelesai');
      case 'PROSES': return t('status.proses');
      case 'PENDING': return t('status.pending');
      case 'BATAL': return t('status.batal');
      case 'CANCEL': return t('status.cancel');
      case 'PROSES ORDER': return t('status.prosesOrder');
      case 'STOK GUDANG': return t('status.stokGudang');
      case 'DELIVERY VENDOR': return t('status.deliveryVendor');
      case 'STOK KOSONG': return t('status.stokKosong');
      case 'DONE': return t('status.done');
      case 'PARTIAL': return t('status.partial');
      case 'READY': return t('status.ready');
      case 'PLANNED': return t('status.planned');
      case 'PICKING': return t('status.picking');
      case 'DISPATCHED': return t('status.dispatched');
      case 'COMPLETED': return t('status.completed');
      case 'FAILED': return t('status.failed');
      case 'SUCCESS':
      case 'OK': return t('common.success');
      case 'ERROR': return t('common.error');
      default: return raw;
    }
  };

  return (
    <UiBadge
      variant="outline"
      round={props.pill}
      class={cn('font-semibold uppercase tracking-wide text-[11px]', colorClass(), props.class)}
    >
      {label()}
    </UiBadge>
  );
};
