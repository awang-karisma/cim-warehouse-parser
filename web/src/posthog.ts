import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;
export const isPosthogConfigured = Boolean(posthogKey && posthogHost);

export type ViewportClass = 'mobile' | 'tablet' | 'desktop';

export function getViewportClass(): ViewportClass {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth < 768) return 'mobile';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
}

const SENSITIVE_URL_RE = /\/(auth|api\/v1\/accurate)\b/i;

export function normalizeApiPath(rawPath: string): string {
  const pathOnly = rawPath.split('?')[0] ?? rawPath;
  return pathOnly
    .replace(/\/ORD-\d+/gi, '/:orderId')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

if (!posthogKey) {
  if (import.meta.env.DEV) {
    console.error(
      'VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured',
    );
  }
} else if (!posthogHost) {
  if (import.meta.env.DEV) {
    console.error(
      'VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured',
    );
  }
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-08-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
      },
      maskCapturedNetworkRequestFn: (request) => {
        if (request?.name && SENSITIVE_URL_RE.test(request.name)) {
          return {
            ...request,
            requestBody: undefined,
            responseBody: undefined,
            requestHeaders: undefined,
            responseHeaders: undefined,
          };
        }
        return request;
      },
    },
    logs: {
      serviceName: 'warehouse-parser-web',
      environment: import.meta.env.MODE,
    },
  });

  posthog.register({
    viewport_class: getViewportClass(),
    app_env: import.meta.env.MODE,
  });

  if (typeof window !== 'undefined') {
    let lastViewport = getViewportClass();
    window.addEventListener(
      'resize',
      () => {
        const next = getViewportClass();
        if (next !== lastViewport) {
          lastViewport = next;
          posthog.register({ viewport_class: next });
        }
      },
      { passive: true },
    );
  }
}

export function registerPosthogContext(props: Record<string, unknown>) {
  if (!isPosthogConfigured) return;
  posthog.register(props);
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!isPosthogConfigured) return;
  posthog.capture(event, properties);
}

export function captureException(error: unknown, properties?: Record<string, unknown>) {
  if (!isPosthogConfigured) return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
  posthog.captureException(err, properties);
}

export default posthog;
