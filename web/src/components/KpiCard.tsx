import { type Component } from 'solid-js';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: string;
}

export const KpiCard: Component<KpiCardProps> = (props) => {
  return (
    <div class="card kpi-card">
      <div>
        <div class="kpi-title">{props.title}</div>
        <div class="kpi-value">{props.value}</div>
      </div>
      <div class="kpi-icon">{props.icon}</div>
    </div>
  );
};
