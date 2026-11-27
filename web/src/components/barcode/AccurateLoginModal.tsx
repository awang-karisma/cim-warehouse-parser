import { type Component, createEffect, createSignal, For, Show } from 'solid-js';
import { useI18n } from '~/i18n';
import { useAuth } from '~/auth';
import {
  authError,
  databases,
  handleLogin,
  handleSelectDatabase,
  isAuthLoading,
  isLoginModalOpen,
  loadAccurateDatabases,
  pendingChallengeId,
  setIsLoginModalOpen,
  status,
} from '~/stores/accurateAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { IconAlertTriangle, IconDatabase, IconKey, IconLoader2 } from '@tabler/icons-solidjs';

export const AccurateLoginModal: Component = () => {
  const { t } = useI18n();
  const auth = useAuth();
  const canSelect = () => auth.can('accurate:read') && auth.can('accurate:update');
  const showDatabases = () => canSelect() && databases().length > 0;
  createEffect(() => {
    if (isLoginModalOpen() && canSelect() && (status().connected || !auth.can('accurate:create'))) {
      void loadAccurateDatabases(auth.can);
    }
  });
  const [otp, setOtp] = createSignal('');

  const onRelogin = async (e: Event) => {
    e.preventDefault();
    if (!auth.can('accurate:create') || isAuthLoading()) return;
    const success = await handleLogin(auth.can, otp());
    if (success) {
      setOtp('');
      if (!canSelect()) handleClose();
    }
  };

  const handleClose = () => {
    setOtp('');
    setIsLoginModalOpen(false);
  };

  return (
    <Dialog open={isLoginModalOpen() && (auth.can('accurate:create') || canSelect())} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <Show
              when={showDatabases()}
              fallback={
                <Show when={pendingChallengeId()} fallback={<IconKey class="size-5 text-primary" />}>
                  <IconKey class="size-5 text-amber-500" />
                </Show>
              }
            >
              <IconDatabase class="size-5 text-sky-500" />
            </Show>
            {showDatabases()
              ? t('barcode.selectDatabase')
              : pendingChallengeId()
              ? t('barcode.twoFactorTitle')
              : t('barcode.accurateConnection')}
          </DialogTitle>
          <DialogDescription>
            {showDatabases()
              ? t('barcode.selectDatabaseDesc')
              : pendingChallengeId()
              ? t('barcode.totpDesc')
              : t('barcode.connectAccurateDesc')}
          </DialogDescription>
        </DialogHeader>

        <Show when={authError()}>
          <Alert variant="destructive">
            <IconAlertTriangle class="size-4" />
            <AlertTitle>{t('barcode.authNotice')}</AlertTitle>
            <AlertDescription class="text-xs">{authError()}</AlertDescription>
          </Alert>
        </Show>

        {/* Database Selection */}
        <Show
          when={showDatabases()}
          fallback={
            <Show when={auth.can('accurate:create')} fallback={<DialogFooter><Button variant="outline" onClick={handleClose}>{t('common.close')}</Button></DialogFooter>}>
            <Show
              when={pendingChallengeId()}
              fallback={
                <div class="space-y-4 py-2">
                  <div class="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                    {t('barcode.singleSessionNotice')}
                  </div>

                  <DialogFooter class="sm:justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={handleClose}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={onRelogin} disabled={isAuthLoading()}>
                      <Show when={isAuthLoading()}>
                        <IconLoader2 class="mr-2 size-4 animate-spin" />
                      </Show>
                      {isAuthLoading() ? t('barcode.connecting') : t('barcode.connectToAccurate')}
                    </Button>
                  </DialogFooter>
                </div>
              }
            >
              <form onSubmit={onRelogin} class="space-y-4 py-2">
                <div class="space-y-2">
                  <label class="text-xs font-semibold text-foreground">
                    {t('barcode.totpPrompt')}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp()}
                    onInput={(e) => setOtp(e.currentTarget.value)}
                    placeholder={t('barcode.totpPlaceholder')}
                    class="w-full text-center font-mono text-lg tracking-widest px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    {t('barcode.totpHelp')}
                  </p>
                </div>

                <DialogFooter class="sm:justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={handleClose}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={isAuthLoading() || otp().trim().length < 6}>
                    <Show when={isAuthLoading()}>
                      <IconLoader2 class="mr-2 size-4 animate-spin" />
                    </Show>
                    {isAuthLoading() ? t('barcode.verifying') : t('barcode.verifyContinue')}
                  </Button>
                </DialogFooter>
              </form>
            </Show>
            </Show>
          }
        >
          <div class="space-y-3 py-2">
            <p class="text-xs text-muted-foreground">
              {t('barcode.selectDatabasePrompt')}
            </p>
            <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
              <For each={databases()}>
                {(db) => (
                  <button
                    type="button"
                    onClick={() => canSelect() && void handleSelectDatabase(auth.can, db.id)}
                    disabled={isAuthLoading()}
                    class="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div class="font-medium text-xs text-foreground group-hover:text-accent-foreground">
                        {db.alias || t('barcode.databaseFallback', { id: db.id })}
                      </div>
                      <div class="text-[10px] text-muted-foreground">
                        ID: {db.id} • {db.host}
                      </div>
                    </div>
                    <IconDatabase class="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                )}
              </For>
            </div>
            <DialogFooter class="sm:justify-end pt-2">
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
            </DialogFooter>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
};
