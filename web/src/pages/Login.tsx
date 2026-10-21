import { type Component, createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { useAuth } from '~/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { IconPackage, IconAlertCircle } from '@tabler/icons-solidjs';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: string;
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

export const Login: Component = () => {
  const auth = useAuth();
  const [error, setError] = createSignal<string | null>(null);
  const [gisLoaded, setGisLoaded] = createSignal(false);
  let googleButtonRef: HTMLDivElement | undefined;

  onMount(() => {
    // Check if script is already present
    if (document.getElementById('google-gis-script')) {
      setGisLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setGisLoaded(true);
    };
    script.onerror = () => {
      setError('Failed to load Google Sign-In SDK. Check your internet connection.');
    };
    document.head.appendChild(script);
  });

  createEffect(() => {
    const config = auth.authConfig();
    const clientId = config?.google_client_id;
    const isLoaded = gisLoaded();
    const btnRef = googleButtonRef;

    if (!isLoaded || !clientId || !btnRef || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            setError(null);
            await auth.login(response.credential);
          } catch (err: any) {
            setError(err?.message || 'Login failed. Please try again.');
          }
        },
      });

      // Clear any prior content
      btnRef.innerHTML = '';
      window.google.accounts.id.renderButton(btnRef, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280,
      });
    } catch (err: any) {
      console.error('Google button render error:', err);
      setError('Error initializing Google Sign-In button.');
    }
  });

  return (
    <div class="min-h-screen w-full flex items-center justify-center p-4 bg-muted/30">
      <Card class="w-full max-w-md shadow-lg border-border">
        <CardHeader class="text-center space-y-2 pb-6">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <IconPackage class="h-8 w-8" />
          </div>
          <CardTitle class="text-2xl font-bold tracking-tight">Warehouse Console</CardTitle>
          <CardDescription>
            Sign in with your Google account to access order tracking and warehouse management
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col items-center justify-center space-y-4 pt-0 pb-8">
          <Show when={error()}>
            <div class="w-full flex items-center gap-2 p-3 text-sm rounded-md bg-destructive/15 text-destructive border border-destructive/20">
              <IconAlertCircle class="h-5 w-5 shrink-0" />
              <span>{error()}</span>
            </div>
          </Show>

          <Show when={auth.loading()}>
            <div class="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Signing in...</span>
            </div>
          </Show>

          <div
            ref={googleButtonRef}
            class="min-h-[44px] flex items-center justify-center w-full"
          />

          <Show when={!auth.authConfig()?.google_client_id && !auth.loading()}>
            <p class="text-xs text-muted-foreground text-center">
              Google Client ID is not configured on the server.
            </p>
          </Show>
        </CardContent>
        <div class="px-6 pb-6 pt-0 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <A href="/privacy" class="underline hover:text-foreground transition-colors">Privacy Policy</A>
          <span>·</span>
          <A href="/terms" class="underline hover:text-foreground transition-colors">Terms of Service</A>
        </div>
      </Card>
    </div>
  );
};
