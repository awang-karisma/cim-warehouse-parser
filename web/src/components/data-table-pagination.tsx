import { type Component, createMemo, Show } from 'solid-js';
import { useI18n } from '~/i18n';
import {
  Pagination,
  PaginationItems,
  PaginationItem,
  PaginationEllipsis,
  PaginationPrevious,
  PaginationNext,
} from '~/components/ui/pagination';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '~/components/ui/select';

interface DataTablePaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  onLimitChange?: (newLimit: number) => void;
  pageSizeOptions?: number[];
}

export const DataTablePagination: Component<DataTablePaginationProps> = (props) => {
  const { t } = useI18n();
  const count = createMemo(() => Math.max(1, Math.ceil(props.total / props.limit)));
  const page = createMemo(() => Math.floor(props.offset / props.limit) + 1);

  const startRecord = createMemo(() => (props.total === 0 ? 0 : props.offset + 1));
  const endRecord = createMemo(() => Math.min(props.offset + props.limit, props.total));

  const pageSizes = () => props.pageSizeOptions || [10, 20, 30, 50, 100];

  return (
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-2">
      <div class="text-sm text-muted-foreground order-2 md:order-1">
        {t('common.showing')}{' '}
        <span class="font-medium text-foreground">{startRecord()}</span>{' '}
        {t('common.to')}{' '}
        <span class="font-medium text-foreground">{endRecord()}</span>{' '}
        {t('common.of')}{' '}
        <span class="font-medium text-foreground">{props.total}</span>{' '}
        {t('common.entries')}
      </div>

      <div class="flex flex-wrap items-center gap-4 sm:gap-6 order-1 md:order-2">
        <Show when={props.onLimitChange}>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {t('common.rowsPerPage')}
            </span>
            <Select<number>
              options={pageSizes()}
              value={props.limit}
              onChange={(val) => {
                if (val && props.onLimitChange) {
                  props.onLimitChange(val);
                }
              }}
              itemComponent={(p) => (
                <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>
              )}
            >
              <SelectTrigger class="h-8 w-[72px]" aria-label={t('common.rowsPerPage')}>
                <SelectValue<number>>{(state) => state.selectedOption() ?? props.limit}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>
        </Show>

        <Pagination
          count={count()}
          page={page()}
          onPageChange={(p) => props.onPageChange((p - 1) * props.limit)}
          itemComponent={(p) => <PaginationItem page={p.page}>{p.page}</PaginationItem>}
          ellipsisComponent={() => <PaginationEllipsis />}
          class="flex items-center gap-1"
        >
          <PaginationPrevious />
          <PaginationItems />
          <PaginationNext />
        </Pagination>
      </div>
    </div>
  );
};
