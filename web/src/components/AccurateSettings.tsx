import { IconPlugConnected } from '@tabler/icons-solidjs';
import { createSignal, onMount, Show, type Component } from 'solid-js';
import { accurateLogout } from '~/api';
import { useAuth } from '~/auth';
import { AccurateLoginModal } from '~/components/barcode/AccurateLoginModal';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useI18n } from '~/i18n';
import { clearAccurateState, refreshStatus, setIsLoginModalOpen, status } from '~/stores/accurateAuth';

export const AccurateSettings: Component = () => {
  const auth = useAuth();
  const { t } = useI18n();
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const canManage = () => auth.can('accurate:create') || (auth.can('accurate:read') && auth.can('accurate:update'));

  onMount(() => void refreshStatus(auth.can));
  async function disconnect() {
    if (!auth.can('accurate:delete') || busy()) return;
    setBusy(true);
    setError('');
    try {
      await accurateLogout();
      clearAccurateState();
      setConfirming(false);
      await refreshStatus(auth.can);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader class="flex flex-row items-start gap-2 space-y-0 pb-4">
        <IconPlugConnected class="size-5 shrink-0" aria-hidden="true" />
        <div>
          <CardTitle class="text-base font-semibold">{t('barcode.accurateConnection')}</CardTitle>
          <CardDescription>{t('settings.accurateShared')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <Show when={auth.can('accurate:read')}>
          <p class="text-sm text-muted-foreground">{status().connected ? status().database?.alias || t('barcode.connected') : t('barcode.accurateDisconnected')}</p>
        </Show>
        <div class="flex flex-wrap gap-2">
          <Show when={canManage()}>
            <Button variant="outline" size="sm" onClick={() => canManage() && setIsLoginModalOpen(true)}>
              {auth.can('accurate:update') && auth.can('accurate:read') && (status().connected || !auth.can('accurate:create')) ? t('barcode.selectDatabase') : t('barcode.connectToAccurate')}
            </Button>
            <AccurateLoginModal />
          </Show>
          <Show when={auth.can('accurate:delete')}>
            <Button variant="outline" size="sm" disabled={busy()} onClick={() => auth.can('accurate:delete') && setConfirming(true)}>{t('settings.accurateDisconnect')}</Button>
          </Show>
        </div>
        <Show when={error()}><p role="alert" class="text-sm text-destructive">{error()}</p></Show>
      </CardContent>
      <AlertDialog open={confirming() && auth.can('accurate:delete')} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('settings.accurateDisconnect')}</AlertDialogTitle>
          <AlertDialogDescription>{t('settings.accurateDisconnectConfirm')}</AlertDialogDescription>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy()} onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={busy()} onClick={() => void disconnect()}>{t('settings.accurateDisconnect')}</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
