export interface SessionColorTokens {
  stroke: string;
  fill: string;
  swatch: string;
  opacity: number;
  isCycled: boolean;
}

const LIGHT_FALLBACKS = ['#2563eb', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'] as const;
const DARK_FALLBACKS = ['#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#f87171', '#22d3ee'] as const;

export const SESSION_COLOR_VARS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'] as const;

function resolveColorVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return raw || fallback;
}

function toRgba(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    if (full.length === 6) {
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return trimmed;
}

export function getSessionColors(isDark: boolean): string[] {
  const fallbacks = isDark ? DARK_FALLBACKS : LIGHT_FALLBACKS;
  return SESSION_COLOR_VARS.map((v, idx) => resolveColorVar(v, fallbacks[idx]));
}

export function getSessionColor(
  index: number,
  isDark: boolean,
  customOpacity?: number,
  customColor?: string,
): SessionColorTokens {
  const palette = getSessionColors(isDark);
  const isCycled = index >= palette.length;
  const base = customColor || palette[index % palette.length];
  const opacity = customOpacity !== undefined ? customOpacity : isCycled ? 0.65 : 1;

  return {
    stroke: toRgba(base, opacity),
    fill: toRgba(base, Math.max(0.06, opacity * 0.14)),
    swatch: base,
    opacity,
    isCycled,
  };
}
