import { A } from '@solidjs/router';
import { Show, type ParentComponent } from 'solid-js';
import { useAuth } from '~/auth';
import { cn } from '~/lib/utils';
import { canAccessRoute, type WorkspaceRoute } from '~/routes';

// Keep already-authorized data visible even when its destination is unavailable.
export const WorkspaceLink: ParentComponent<{ route: WorkspaceRoute; href: string; class?: string; linkClass?: string; title?: string }> = (props) => {
  const auth = useAuth();
  return (
    <Show when={canAccessRoute(auth, props.route)} fallback={<div class={props.class}>{props.children}</div>}>
      <A href={props.href} class={cn('group', props.class, props.linkClass)} title={props.title}>{props.children}</A>
    </Show>
  );
};
