import { A } from '@solidjs/router';
import { IconLock, IconRefresh, IconShieldOff } from '@tabler/icons-solidjs';
import { Show, createSignal, type Component } from 'solid-js';
import { useAuth } from '~/auth';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/i18n';
import { ROUTES } from '~/routes';

export const WorkspaceAccess: Component<{ kind: 'denied' | 'unprovisioned' | 'unavailable' }> = (props) => {
  const auth = useAuth();
  const { t } = useI18n();
  const [checking, setChecking] = createSignal(false);
  const refresh = async () => {
    if (checking()) return;
    setChecking(true);
    try {
      await auth.refetch();
    } finally {
      setChecking(false);
    }
  };

  return (
    <section class="mx-auto flex w-full max-w-lg flex-col items-start gap-3 rounded-lg border bg-card p-6 text-card-foreground sm:p-8" aria-labelledby="workspace-access-title">
      <Show when={props.kind === 'unavailable'} fallback={<IconLock class="size-6 text-muted-foreground" aria-hidden="true" />}>
        <IconShieldOff class="size-6 text-muted-foreground" aria-hidden="true" />
      </Show>
      <h1 id="workspace-access-title" class="text-xl font-semibold tracking-tight">{t(`access.${props.kind}.title`)}</h1>
      <p class="text-sm leading-relaxed text-muted-foreground">{t(`access.${props.kind}.description`)}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <Show when={props.kind === 'denied'} fallback={
          <Button type="button" onClick={refresh} disabled={checking()}>
            <IconRefresh class="size-4" />{checking() ? t('common.loadingSession') : t('access.refresh')}
          </Button>
        }>
          <Button as={A} href={ROUTES.root}>{t('access.home')}</Button>
        </Show>
        <Show when={props.kind === 'unprovisioned'}>
          <Button as={A} href={ROUTES.settings} variant="outline">{t('access.preferences')}</Button>
          <Button type="button" variant="ghost" onClick={() => void auth.logout()}>{t('common.signOut')}</Button>
        </Show>
      </div>
    </section>
  );
};
