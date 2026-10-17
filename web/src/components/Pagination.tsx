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
    <div class="pagination-wrapper">
      <div class="page-info">
        Showing <strong>{startRecord()}</strong> to <strong>{endRecord()}</strong> of{' '}
        <strong>{props.total}</strong> results
      </div>
      <ul class="pagination">
        <li class={`page-item ${currentPage() <= 1 ? 'disabled' : ''}`}>
          <button
            type="button"
            class="page-link"
            disabled={currentPage() <= 1}
            onClick={() => props.onPageChange(Math.max(0, props.offset - props.limit))}
          >
            &laquo; Prev
          </button>
        </li>
        {pageNumbers().map((p) => (
          <li class={`page-item ${p === currentPage() ? 'active' : ''}`}>
            <button
              type="button"
              class="page-link"
              onClick={() => props.onPageChange((p - 1) * props.limit)}
            >
              {p}
            </button>
          </li>
        ))}
        <li class={`page-item ${currentPage() >= totalPages() ? 'disabled' : ''}`}>
          <button
            type="button"
            class="page-link"
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
