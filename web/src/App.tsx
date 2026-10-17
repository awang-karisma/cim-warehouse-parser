import { type Component, type RouteSectionProps } from 'solid-js';
import { Sidebar } from './components/Sidebar';

export const App: Component<RouteSectionProps> = (props) => {
  return (
    <div class="flex min-h-screen">
      <Sidebar />
      <div class="ml-60 flex-1 flex flex-col min-w-0 bg-bg">{props.children}</div>
    </div>
  );
};
