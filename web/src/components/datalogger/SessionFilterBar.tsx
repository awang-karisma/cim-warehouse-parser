import { Show } from 'solid-js';
import { IconCalendar, IconSearch, IconX } from '@tabler/icons-solidjs';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/i18n';
import {
  createEmptyDateFilter,
  hasActiveSessionFilter,
  type SessionDateFilterState,
} from './session-filter';

interface SessionFilterBarProps {
  value: SessionDateFilterState;
  onChange: (next: SessionDateFilterState) => void;
  totalCount: number;
  filteredCount: number;
  compact?: boolean;
  hideSearch?: boolean;
}

export function SessionFilterBar(props: SessionFilterBarProps) {
  const { t } = useI18n();
  const active = () => hasActiveSessionFilter(props.value);

  const update = (patch: Partial<SessionDateFilterState>) => {
    props.onChange({ ...props.value, ...patch });
  };

  return (
    <div class={props.compact ? 'space-y-2' : 'flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between'}>
      <div class={props.compact ? 'space-y-2' : 'flex flex-wrap items-center gap-2'}>
        <Show when={!props.hideSearch}>
          <div class={props.compact ? 'relative w-full' : 'relative w-full sm:w-56'}>
            <IconSearch class="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label={t('datalogger.filter.searchSessionsAria')}
              value={props.value.query}
              onInput={(e) => update({ query: e.currentTarget.value })}
              placeholder={t('datalogger.filter.searchPlaceholder')}
              class="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </Show>

        {/* Single-Day vs Date-Range toggle */}
        <div
          role="group"
          aria-label={t('datalogger.filter.dateFilterModeAria')}
          class="inline-flex h-8 items-center rounded-md border bg-muted/50 p-0.5 text-[11px]"
        >
          <button
            type="button"
            aria-pressed={props.value.mode === 'single'}
            onClick={() => update({ mode: 'single' })}
            class={`rounded-sm px-2 py-1 font-medium transition-colors ${
              props.value.mode === 'single'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('datalogger.filter.modeDay')}
          </button>
          <button
            type="button"
            aria-pressed={props.value.mode === 'range'}
            onClick={() => update({ mode: 'range' })}
            class={`rounded-sm px-2 py-1 font-medium transition-colors ${
              props.value.mode === 'range'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('datalogger.filter.modeRange')}
          </button>
        </div>

        {/* Date inputs */}
        <Show
          when={props.value.mode === 'single'}
          fallback={
            <div class={props.compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap items-center gap-1.5'}>
              <div class="relative flex items-center">
                <input
                  type="date"
                  aria-label={t('datalogger.filter.filterFromDateAria')}
                  value={props.value.fromDate}
                  onInput={(e) => update({ fromDate: e.currentTarget.value })}
                  class="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Show when={!props.compact}>
                <span class="text-xs text-muted-foreground">–</span>
              </Show>
              <div class="relative flex items-center">
                <input
                  type="date"
                  aria-label={t('datalogger.filter.filterToDateAria')}
                  value={props.value.toDate}
                  onInput={(e) => update({ toDate: e.currentTarget.value })}
                  class="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          }
        >
          <div class="relative flex items-center gap-1.5">
            <IconCalendar class="size-3.5 shrink-0 text-muted-foreground" />
            <input
              type="date"
              aria-label={t('datalogger.filter.filterSingleDateAria')}
              value={props.value.singleDate}
              onInput={(e) => update({ singleDate: e.currentTarget.value })}
              class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </Show>

        <Show when={active()}>
          <Button
            size="sm"
            variant="ghost"
            class="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => props.onChange(createEmptyDateFilter())}
          >
            <IconX class="size-3.5" />
            {t('datalogger.filter.clear')}
          </Button>
        </Show>
      </div>

      <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          <Show
            when={active()}
            fallback={
              <span>
                <strong class="font-mono text-foreground tabular-nums">{props.totalCount}</strong>{' '}
                {t('datalogger.filter.totalSessions', { count: props.totalCount }).replace(String(props.totalCount), '').trim()}
              </span>
            }
          >
            <span>
              {t('datalogger.filter.overlappingSessions', {
                filtered: props.filteredCount,
                total: props.totalCount,
              })}
            </span>
          </Show>
        </span>
      </div>
    </div>
  );
}
