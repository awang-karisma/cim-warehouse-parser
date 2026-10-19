import { type Component, type JSX, Show } from 'solid-js';
import { TableHead } from '~/components/ui/table';
import type { SortDirection } from '~/utils/tableSorting';

interface SortableTableHeadProps {
  field: string;
  label: JSX.Element;
  direction?: SortDirection;
  onSort: (field: string) => void;
  class?: string;
}

export const SortableTableHead: Component<SortableTableHeadProps> = (props) => (
  <TableHead aria-sort={props.direction ? (props.direction === 'asc' ? 'ascending' : 'descending') : 'none'} class={props.class}>
    <button type="button" class="inline-flex items-center gap-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm" onClick={() => props.onSort(props.field)}>
      {props.label}
      <Show when={props.direction} fallback={<span aria-hidden="true" class="text-muted-foreground/50">↕</span>}>
        <span aria-hidden="true">{props.direction === 'asc' ? '↑' : '↓'}</span>
      </Show>
    </button>
  </TableHead>
);
