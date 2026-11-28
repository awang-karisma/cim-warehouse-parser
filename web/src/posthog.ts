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

export interface RequestCorrelation {
  traceId: string;
  spanId: string;
  traceparent: string;
  requestId: string;
  sessionId?: string;
  distinctId?: string;
  windowId?: string;
}

function randomNonZeroHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  let allZero = true;
  while (allZero) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < byteLength; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    allZero = bytes.every((b) => b === 0);
  }
  let hex = '';
  for (let i = 0; i < byteLength; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function createRequestCorrelation(): RequestCorrelation {
  const traceId = randomNonZeroHex(16);
  const spanId = randomNonZeroHex(8);
  const correlation: RequestCorrelation = {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
    requestId: traceId,
  };
  if (isPosthogConfigured) {
    const sessionId = posthog.get_session_id?.() || undefined;
    const rawDistinctId = posthog.get_distinct_id?.() || undefined;
    const distinctId = rawDistinctId && rawDistinctId !== '$posthog_cookieless' ? rawDistinctId : undefined;
    const windowId = posthog.sessionManager?.checkAndGetSessionAndWindowId?.(true)?.windowId || undefined;
    if (sessionId) correlation.sessionId = sessionId;
    if (distinctId) correlation.distinctId = distinctId;
    if (windowId) correlation.windowId = windowId;
  }
  return correlation;
}

export function withCorrelationHeaders(
  headersInit?: HeadersInit,
  correlation: RequestCorrelation = createRequestCorrelation(),
): { headers: Headers; correlation: RequestCorrelation } {
  const headers = new Headers(headersInit);
  if (!headers.has('traceparent')) {
    headers.set('traceparent', correlation.traceparent);
  }
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', correlation.requestId);
  }
  if (correlation.sessionId && !headers.has('X-PostHog-Session-Id')) {
    headers.set('X-PostHog-Session-Id', correlation.sessionId);
  }
  if (correlation.distinctId && !headers.has('X-PostHog-Distinct-Id')) {
    headers.set('X-PostHog-Distinct-Id', correlation.distinctId);
  }
  if (correlation.windowId && !headers.has('X-PostHog-Window-Id')) {
    headers.set('X-PostHog-Window-Id', correlation.windowId);
  }
  return { headers, correlation };
}

export function captureLog(options: {
  body: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  attributes?: Record<string, string | number | boolean | undefined>;
  correlation?: Pick<RequestCorrelation, 'traceId' | 'spanId' | 'requestId'>;
}): void {
  if (!isPosthogConfigured) return;
  const cleanAttributes: Record<string, string | number | boolean> = {};
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      if (value !== undefined) {
        cleanAttributes[key] = value;
      }
    }
  }
  if (options.correlation?.requestId && cleanAttributes.request_id === undefined) {
    cleanAttributes.request_id = options.correlation.requestId;
  }
  if (options.correlation?.traceId && cleanAttributes.trace_id === undefined) {
    cleanAttributes.trace_id = options.correlation.traceId;
  }
  posthog.captureLog({
    body: options.body,
    level: options.level ?? 'info',
    attributes: cleanAttributes,
    trace_id: options.correlation?.traceId,
    span_id: options.correlation?.spanId,
    trace_flags: options.correlation?.traceId ? 1 : undefined,
  });
}

export function captureException(error: unknown, properties?: Record<string, unknown>) {
  if (!isPosthogConfigured) return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
  const mergedProps: Record<string, unknown> = { ...properties };
  if (error && typeof error === 'object') {
    const correlated = error as { requestId?: unknown; traceId?: unknown };
    if (typeof correlated.requestId === 'string' && correlated.requestId && mergedProps.request_id === undefined) {
      mergedProps.request_id = correlated.requestId;
    }
    if (typeof correlated.traceId === 'string' && correlated.traceId && mergedProps.trace_id === undefined) {
      mergedProps.trace_id = correlated.traceId;
    }
  }
  posthog.captureException(err, mergedProps);
}

export default posthog;
