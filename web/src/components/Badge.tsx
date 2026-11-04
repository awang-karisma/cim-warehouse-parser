import { type Component } from 'solid-js';
import { DELIVERY_RUN_STATUS, ORDER_STATUS, STOCK_STATUS, SYNC_STATUS } from '~/domain';
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
		if (s === STOCK_STATUS.PROCESSING_ORDER) {
			return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
		}
		if (s === STOCK_STATUS.WAREHOUSE) {
			return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
		}
		if (s === STOCK_STATUS.DONE) {
			return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
		}
		if (s === STOCK_STATUS.VENDOR_DELIVERY) {
			return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
		}
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    }

    if (props.kind === 'sync') {
		if ([SYNC_STATUS.SUCCESS, DELIVERY_RUN_STATUS.COMPLETED, 'OK'].includes(s)) {
			return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
		}
		if ([SYNC_STATUS.SYNCING, ORDER_STATUS.PROCESSING, 'IN_PROGRESS'].includes(s)) {
			return 'bg-status-proses/15 text-status-proses border-status-proses/30';
		}
		if (['FAILED', SYNC_STATUS.ERROR].includes(s)) {
			return 'bg-status-batal/15 text-status-batal border-status-batal/30';
		}
      return 'bg-muted text-muted-foreground border-transparent';
    }

    // Default / order status
		if (([ORDER_STATUS.COMPLETE, SYNC_STATUS.SUCCESS, DELIVERY_RUN_STATUS.COMPLETED, DELIVERY_RUN_STATUS.READY, STOCK_STATUS.DONE] as readonly string[]).includes(s)) {
			return 'bg-status-selesai/15 text-status-selesai border-status-selesai/30';
		}
		if ([ORDER_STATUS.PROCESSING, 'PARTIAL'].includes(s)) {
			return 'bg-status-proses/15 text-status-proses border-status-proses/30';
		}
		if (s === ORDER_STATUS.UNFINISHED) {
			return 'bg-status-belum-selesai/15 text-status-belum-selesai border-status-belum-selesai/30';
		}
		if (s === ORDER_STATUS.PENDING) {
			return 'bg-status-pending/15 text-status-pending border-status-pending/30';
		}
		if (([ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCEL] as readonly string[]).includes(s)) {
			return 'bg-status-batal/15 text-status-batal border-status-batal/30';
		}
    return 'bg-muted text-muted-foreground border-transparent';
  };

  const label = () => {
    const raw = props.status;
    if (!raw || raw === '-') return '-';
    const s = raw.trim().toUpperCase();
    switch (s) {
		case ORDER_STATUS.COMPLETE: return t('status.selesai');
		case ORDER_STATUS.UNFINISHED: return t('status.belumSelesai');
		case ORDER_STATUS.PROCESSING: return t('status.proses');
		case ORDER_STATUS.PENDING: return t('status.pending');
		case ORDER_STATUS.CANCELLED: return t('status.batal');
		case ORDER_STATUS.CANCEL: return t('status.cancel');
		case STOCK_STATUS.PROCESSING_ORDER: return t('status.prosesOrder');
		case STOCK_STATUS.WAREHOUSE: return t('status.stokGudang');
		case STOCK_STATUS.VENDOR_DELIVERY: return t('status.deliveryVendor');
		case STOCK_STATUS.EMPTY: return t('status.stokKosong');
		case STOCK_STATUS.DONE: return t('status.done');
		case 'PARTIAL': return t('status.partial');
		case DELIVERY_RUN_STATUS.READY: return t('status.ready');
		case DELIVERY_RUN_STATUS.PLANNED: return t('status.planned');
		case DELIVERY_RUN_STATUS.PICKING: return t('status.picking');
		case DELIVERY_RUN_STATUS.DISPATCHED: return t('status.dispatched');
		case DELIVERY_RUN_STATUS.COMPLETED: return t('status.completed');
		case 'FAILED': return t('status.failed');
		case SYNC_STATUS.SUCCESS:
		case 'OK': return t('common.success');
		case SYNC_STATUS.ERROR: return t('common.error');
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
