import { type Component, type RouteSectionProps } from 'solid-js';
import { Sidebar } from './components/Sidebar';

export const App: Component<RouteSectionProps> = (props) => {
  return (
    <div class="app">
      <Sidebar />
      <div class="main-wrapper">{props.children}</div>
    </div>
  );
};
