import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from '@tabler/icons-solidjs';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/i18n';

interface PaginationControlsProps {
  total: number;
  page: number; // 1-indexed
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  compact?: boolean;
  itemLabel?: string;
}

const DEFAULT_SIZES = [10, 20, 50, 100];

export function PaginationControls(props: PaginationControlsProps) {
  const { t } = useI18n();
  const [customDraft, setCustomDraft] = createSignal('');
  const [showCustomInput, setShowCustomInput] = createSignal(false);

  const presets = () => props.pageSizeOptions ?? DEFAULT_SIZES;
  const totalPages = createMemo(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));
  const safePage = createMemo(() => Math.min(Math.max(1, props.page), totalPages()));
  const startItem = createMemo(() => (props.total === 0 ? 0 : (safePage() - 1) * props.pageSize + 1));
  const endItem = createMemo(() => Math.min(props.total, safePage() * props.pageSize));

  const isCustomSize = createMemo(() => !presets().includes(props.pageSize));

  const applyCustomSize = () => {
    const parsed = parseInt(customDraft(), 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      const clamped = Math.min(500, Math.max(1, parsed));
      props.onPageSizeChange(clamped);
      props.onPageChange(1);
    }
    setShowCustomInput(false);
    setCustomDraft('');
  };

  const handleSelectChange = (raw: string) => {
    if (raw === 'custom') {
      setCustomDraft(String(props.pageSize));
      setShowCustomInput(true);
      return;
    }
    const val = Number(raw);
    if (Number.isFinite(val) && val > 0) {
      setShowCustomInput(false);
      props.onPageSizeChange(val);
      props.onPageChange(1);
    }
  };

  return (
    <div
      class={
        props.compact
          ? 'flex flex-col gap-2 border-t bg-muted/20 px-2.5 py-2 text-xs'
          : 'flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between text-xs'
      }
    >
      {/* Range summary + page size control */}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-mono text-[11px] text-muted-foreground tabular-nums">
          {startItem()}–{endItem()} {t('common.of')} {props.total.toLocaleString()} {props.itemLabel ?? ''}
        </span>

        <div class="flex items-center gap-1.5">
          <label class="text-[11px] text-muted-foreground whitespace-nowrap">{t('datalogger.pagination.perPage')}</label>
          <Show
            when={!showCustomInput()}
            fallback={
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={500}
                  aria-label={t('datalogger.pagination.customPageSizeAria')}
                  value={customDraft()}
                  onInput={(e) => setCustomDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomSize();
                    if (e.key === 'Escape') setShowCustomInput(false);
                  }}
                  onBlur={applyCustomSize}
                  class="h-7 w-16 rounded-md border border-input bg-background px-2 font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            }
          >
            <select
              aria-label={t('datalogger.pagination.itemsPerPageAria')}
              value={isCustomSize() ? String(props.pageSize) : String(props.pageSize)}
              onChange={(e) => handleSelectChange(e.currentTarget.value)}
              class="h-7 rounded-md border border-input bg-background px-1.5 font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <For each={presets()}>
                {(sz) => <option value={String(sz)}>{sz}</option>}
              </For>
              <Show when={isCustomSize()}>
                <option value={String(props.pageSize)}>
                  {t('datalogger.pagination.customOption', { size: props.pageSize })}
                </option>
              </Show>
              <option value="custom">{t('datalogger.pagination.custom')}</option>
            </select>
          </Show>
        </div>
      </div>

      {/* Page navigation buttons */}
      <div class="flex items-center justify-between gap-1 sm:justify-end">
        <div class="flex items-center gap-1">
          <Show when={!props.compact}>
            <Button
              size="icon"
              variant="outline"
              class="size-7"
              disabled={safePage() <= 1}
              onClick={() => props.onPageChange(1)}
              aria-label={t('datalogger.pagination.firstPageAria')}
            >
              <IconChevronsLeft class="size-3.5" />
            </Button>
          </Show>
          <Button
            size="icon"
            variant="outline"
            class="size-7"
            disabled={safePage() <= 1}
            onClick={() => props.onPageChange(safePage() - 1)}
            aria-label={t('datalogger.pagination.previousPageAria')}
          >
            <IconChevronLeft class="size-3.5" />
          </Button>
        </div>

        <span class="px-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          {t('datalogger.pagination.pageOf', { page: safePage(), total: totalPages() })}
        </span>

        <div class="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            class="size-7"
            disabled={safePage() >= totalPages()}
            onClick={() => props.onPageChange(safePage() + 1)}
            aria-label={t('datalogger.pagination.nextPageAria')}
          >
            <IconChevronRight class="size-3.5" />
          </Button>
          <Show when={!props.compact}>
            <Button
              size="icon"
              variant="outline"
              class="size-7"
              disabled={safePage() >= totalPages()}
              onClick={() => props.onPageChange(totalPages())}
              aria-label={t('datalogger.pagination.lastPageAria')}
            >
              <IconChevronsRight class="size-3.5" />
            </Button>
          </Show>
        </div>
      </div>
    </div>
  );
}
