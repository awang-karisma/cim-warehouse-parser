import { type Component } from 'solid-js';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: Component<{ size?: number; stroke?: number; class?: string; 'aria-hidden'?: string }>;
}

export const KpiCard: Component<KpiCardProps> = (props) => {
  const Icon = props.icon;
  return (
    <div class="bg-surface rounded-lg border border-border shadow-sm p-5 flex items-center justify-between h-full">
      <div>
        <div class="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{props.title}</div>
        <div class="text-2xl font-bold text-text">{props.value}</div>
      </div>
      <div class="w-13 h-13 rounded-xl bg-gray-100 flex items-center justify-center text-text shrink-0">
        <Icon size={28} stroke={1.8} aria-hidden="true" />
      </div>
    </div>
  );
};
