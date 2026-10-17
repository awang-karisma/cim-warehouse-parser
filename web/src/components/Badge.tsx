import { type Component } from 'solid-js';

interface BadgeProps {
  status: string;
  pill?: boolean;
}

export const Badge: Component<BadgeProps> = (props) => {
  const getBadgeClass = (s: string) => {
    const upper = s ? s.toUpperCase() : '';
    if (['SELESAI', 'SUCCESS', 'COMPLETED', 'READY', 'DONE'].includes(upper)) {
      return 'badge-selesai';
    }
    if (['PROSES', 'PARTIAL'].includes(upper)) {
      return 'badge-proses';
    }
    if (['PENDING', 'CANCEL', 'BATAL', 'ERROR', 'FAILED', 'STOK KOSONG'].includes(upper)) {
      return 'badge-pending';
    }
    return 'badge-gray';
  };

  return (
    <span class={`badge ${getBadgeClass(props.status)} ${props.pill ? 'badge-pill' : ''}`}>
      {props.status || '-'}
    </span>
  );
};
