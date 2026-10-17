import { type Component, type JSX, Show } from 'solid-js';

interface TopBarProps {
  title: string;
  statusText?: string;
  statusType?: 'success' | 'syncing' | 'error';
  children?: JSX.Element;
}

export const TopBar: Component<TopBarProps> = (props) => {
  return (
    <header class="bg-surface border-b border-border px-8 py-4 flex justify-between items-center sticky top-0 z-40">
      <h1 class="text-xl font-bold text-text">{props.title}</h1>
      <div class="flex items-center gap-4">
        <Show when={props.statusText}>
          <div class="flex items-center gap-2 text-xs text-muted bg-gray-100 px-3.5 py-1.5 rounded-full">
            <span
              class={`w-2 h-2 rounded-full inline-block ${
                props.statusType === 'syncing'
                  ? 'bg-status-proses ring-4 ring-status-proses/20 animate-pulse'
                  : props.statusType === 'error'
                  ? 'bg-status-pending ring-4 ring-status-pending/20'
                  : 'bg-status-selesai ring-4 ring-status-selesai/20'
              }`}
            />
            <span>{props.statusText}</span>
          </div>
        </Show>
        {props.children}
      </div>
    </header>
  );
};
