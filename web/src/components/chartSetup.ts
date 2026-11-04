import { createSignal, onCleanup } from 'solid-js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Filler,
  Legend,
  Tooltip,
);

/** Tracks light/dark so charts re-render their chrome (grid, ticks, tooltips) on theme flip. */
export const useThemeSignal = () => {
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));
  const observer = new MutationObserver(() =>
    setIsDark(document.documentElement.classList.contains('dark')),
  );
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  onCleanup(() => observer.disconnect());
  return isDark;
};

const cssVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : fallback;
};

const resolveVar = (name: string, fallback: string, depth = 0): string => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  if (raw.startsWith('var(') && depth < 3) {
    const inner = raw.slice(4, raw.indexOf(')')).trim();
    return resolveVar(inner, fallback, depth + 1);
  }
  return raw;
};

const hexAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export interface ChartPalette {
  foreground: string;
  muted: string;
  border: string;
  card: string;
  primary: string;
  selesai: string;
  proses: string;
  belumSelesai: string;
  pending: string;
  batal: string;
  other: string;
}

/** Reads the live design tokens so charts track the theme instead of freezing at mount. */
export const readPalette = (isDark: boolean): ChartPalette => {
  const hex = (name: string, fallback: string) => resolveVar(name, fallback);
  return {
    foreground: cssVar('--foreground', isDark ? '#fafafa' : '#09090b'),
    muted: cssVar('--muted-foreground', isDark ? '#a1a1aa' : '#71717a'),
    border: cssVar('--border', isDark ? '#27272a' : '#e4e4e7'),
    card: cssVar('--card', isDark ? '#09090b' : '#ffffff'),
    primary: cssVar('--primary', isDark ? '#fafafa' : '#18181b'),
    selesai: hex('--color-status-selesai', isDark ? '#34d399' : '#10b981'),
    proses: hex('--color-status-proses', isDark ? '#fbbf24' : '#f59e0b'),
    belumSelesai: hex('--color-status-belum-selesai', isDark ? '#facc15' : '#eab308'),
    pending: hex('--color-status-pending', isDark ? '#c084fc' : '#a855f7'),
    batal: hex('--color-status-batal', isDark ? '#f87171' : '#ef4444'),
    other: cssVar('--muted-foreground', isDark ? '#a1a1aa' : '#71717a'),
  };
};

export { hexAlpha };
