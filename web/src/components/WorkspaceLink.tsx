import { A } from '@solidjs/router';
import { Show, type ParentComponent } from 'solid-js';
import { useAuth } from '~/auth';
import { canAccessRoute, type WorkspaceRoute } from '~/routes';

// Keep already-authorized data visible even when its destination is unavailable.
export const WorkspaceLink: ParentComponent<{ route: WorkspaceRoute; href: string; class?: string; title?: string }> = (props) => {
  const auth = useAuth();
  return (
    <Show when={canAccessRoute(auth, props.route)} fallback={<div class={props.class}>{props.children}</div>}>
      <A href={props.href} class={props.class} title={props.title}>{props.children}</A>
    </Show>
  );
};
