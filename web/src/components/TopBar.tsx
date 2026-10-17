import { type Component, type JSX, Show } from 'solid-js';

interface TopBarProps {
  title: string;
  statusText?: string;
  statusType?: 'success' | 'syncing' | 'error';
  children?: JSX.Element;
}

export const TopBar: Component<TopBarProps> = (props) => {
  return (
    <header class="top-bar">
      <h1 class="page-title">{props.title}</h1>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
        <Show when={props.statusText}>
          <div class="sync-status">
            <span
              class={`status-dot ${
                props.statusType === 'syncing'
                  ? 'syncing'
                  : props.statusType === 'error'
                  ? 'error'
                  : ''
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
