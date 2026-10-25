import { type Component, createSignal, For, Show } from 'solid-js';
import {
  authError,
  databases,
  handleLogin,
  handleSelectDatabase,
  isAuthLoading,
  isLoginModalOpen,
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
  const [otp, setOtp] = createSignal('');

  const onRelogin = async (e: Event) => {
    e.preventDefault();
    const success = await handleLogin(otp());
    if (success) {
      setOtp('');
    }
  };

  const handleClose = () => {
    setOtp('');
    setIsLoginModalOpen(false);
  };

  return (
    <Dialog open={isLoginModalOpen()} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <Show
              when={databases().length > 0 && !status().connected}
              fallback={
                <Show when={pendingChallengeId()} fallback={<IconKey class="size-5 text-primary" />}>
                  <IconKey class="size-5 text-amber-500" />
                </Show>
              }
            >
              <IconDatabase class="size-5 text-sky-500" />
            </Show>
            {databases().length > 0 && !status().connected
              ? 'Select Accurate Database'
              : pendingChallengeId()
              ? 'Two-Factor Authentication (MFA)'
              : 'Accurate Online Connection'}
          </DialogTitle>
          <DialogDescription>
            {databases().length > 0 && !status().connected
              ? 'Choose a tenant database to establish your active printing session.'
              : pendingChallengeId()
              ? 'Enter the 6-digit verification code from your authenticator app.'
              : 'Connect to Accurate Online using credentials configured on the server.'}
          </DialogDescription>
        </DialogHeader>

        <Show when={authError()}>
          <Alert variant="destructive">
            <IconAlertTriangle class="size-4" />
            <AlertTitle>Authentication Notice</AlertTitle>
            <AlertDescription class="text-xs">{authError()}</AlertDescription>
          </Alert>
        </Show>

        {/* Database Selection */}
        <Show
          when={databases().length > 0 && !status().connected}
          fallback={
            <Show
              when={pendingChallengeId()}
              fallback={
                <div class="space-y-4 py-2">
                  <div class="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                    Accurate Online permits one active web session per account. Authenticating here establishes a
                    fresh session using server-configured credentials.
                  </div>

                  <DialogFooter class="sm:justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button onClick={onRelogin} disabled={isAuthLoading()}>
                      <Show when={isAuthLoading()}>
                        <IconLoader2 class="mr-2 size-4 animate-spin" />
                      </Show>
                      {isAuthLoading() ? 'Connecting...' : 'Connect to Accurate'}
                    </Button>
                  </DialogFooter>
                </div>
              }
            >
              <form onSubmit={onRelogin} class="space-y-4 py-2">
                <div class="space-y-2">
                  <label class="text-xs font-semibold text-foreground">
                    Authenticator Code (TOTP)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp()}
                    onInput={(e) => setOtp(e.currentTarget.value)}
                    placeholder="123456"
                    class="w-full text-center font-mono text-lg tracking-widest px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    Your account has 2-Step Verification enabled. Enter the 6-digit code.
                  </p>
                </div>

                <DialogFooter class="sm:justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isAuthLoading() || otp().trim().length < 6}>
                    <Show when={isAuthLoading()}>
                      <IconLoader2 class="mr-2 size-4 animate-spin" />
                    </Show>
                    {isAuthLoading() ? 'Verifying...' : 'Verify & Continue'}
                  </Button>
                </DialogFooter>
              </form>
            </Show>
          }
        >
          <div class="space-y-3 py-2">
            <p class="text-xs text-muted-foreground">
              Select the database you wish to open for barcode search and transaction loading:
            </p>
            <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
              <For each={databases()}>
                {(db) => (
                  <button
                    type="button"
                    onClick={() => void handleSelectDatabase(db.id)}
                    disabled={isAuthLoading()}
                    class="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div class="font-medium text-xs text-foreground group-hover:text-accent-foreground">
                        {db.alias || `Database #${db.id}`}
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
                Cancel
              </Button>
            </DialogFooter>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
};
