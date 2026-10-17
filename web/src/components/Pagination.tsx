import { type Component, createMemo } from 'solid-js';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}

export const Pagination: Component<PaginationProps> = (props) => {
  const currentPage = createMemo(() => Math.floor(props.offset / props.limit) + 1);
  const totalPages = createMemo(() => Math.max(1, Math.ceil(props.total / props.limit)));

  const startRecord = createMemo(() => (props.total === 0 ? 0 : props.offset + 1));
  const endRecord = createMemo(() => Math.min(props.offset + props.limit, props.total));

  const pageNumbers = createMemo(() => {
    const total = totalPages();
    const cur = currentPage();
    const pages: number[] = [];
    const start = Math.max(1, cur - 2);
    const end = Math.min(total, cur + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  return (
    <div class="flex flex-wrap items-center justify-between gap-4 mt-5 pt-3.5 border-t border-border">
      <div class="text-xs text-muted">
        Showing <strong class="text-text font-semibold">{startRecord()}</strong> to{' '}
        <strong class="text-text font-semibold">{endRecord()}</strong> of{' '}
        <strong class="text-text font-semibold">{props.total}</strong> results
      </div>
      <ul class="flex items-center gap-1 list-none m-0 p-0">
        <li>
          <button
            type="button"
            class="flex items-center justify-center min-w-8 h-8 px-2 border border-border rounded-md bg-surface text-xs text-text hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            disabled={currentPage() <= 1}
            onClick={() => props.onPageChange(Math.max(0, props.offset - props.limit))}
          >
            &laquo; Prev
          </button>
        </li>
        {pageNumbers().map((p) => {
          const isCurrent = () => p === currentPage();
          return (
            <li>
              <button
                type="button"
                class={`flex items-center justify-center min-w-8 h-8 px-2 border rounded-md text-xs cursor-pointer transition-colors ${
                  isCurrent()
                    ? 'bg-primary text-white border-primary font-semibold'
                    : 'border-border bg-surface text-text hover:bg-gray-50'
                }`}
                onClick={() => props.onPageChange((p - 1) * props.limit)}
              >
                {p}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            class="flex items-center justify-center min-w-8 h-8 px-2 border border-border rounded-md bg-surface text-xs text-text hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            disabled={currentPage() >= totalPages()}
            onClick={() => props.onPageChange(props.offset + props.limit)}
          >
            Next &raquo;
          </button>
        </li>
      </ul>
    </div>
  );
};
