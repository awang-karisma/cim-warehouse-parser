import { type Component } from 'solid-js';

interface BadgeProps {
  status: string;
  pill?: boolean;
}

export const Badge: Component<BadgeProps> = (props) => {
  const upper = () => (props.status ? props.status.toUpperCase() : '');
  const colorClass = () => {
    const s = upper();
    if (['SELESAI', 'SUCCESS', 'COMPLETED', 'READY', 'DONE'].includes(s)) {
      return 'bg-status-selesai/15 text-status-selesai';
    }
    if (['PROSES', 'PARTIAL'].includes(s)) {
      return 'bg-status-proses/15 text-status-proses';
    }
    if (['BATAL', 'CANCEL'].includes(s)) {
      return 'bg-status-batal/15 text-status-batal';
    }
    if (['PENDING', 'ERROR', 'FAILED', 'STOK KOSONG'].includes(s)) {
      return 'bg-status-pending/15 text-status-pending';
    }
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <span
      class={`inline-flex items-center font-semibold uppercase tracking-wide whitespace-nowrap ${
        props.pill ? 'rounded-full px-3 py-1 text-xs' : 'rounded-md px-2.5 py-0.5 text-[11px]'
      } ${colorClass()}`}
    >
      {props.status || '-'}
    </span>
  );
};
