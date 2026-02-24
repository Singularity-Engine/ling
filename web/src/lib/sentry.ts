/**
 * Sentry error monitoring — lazy init
 *
 * Only initializes when VITE_SENTRY_DSN is set.
 * Keeps bundle impact minimal by importing @sentry/react only when needed.
 */

import { createLogger } from '../utils/logger';

const log = createLogger('Sentry');

let initialized = false;

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) return;

  try {
    const Sentry = await import('@sentry/react');

    Sentry.init({
      dsn,
      environment: import.meta.env.DEV ? 'development' : 'production',
      // Only send 20% of transactions in production to stay within quota
      tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
      // Filter out known noisy errors
      beforeSend(event) {
        const msg = event.exception?.values?.[0]?.value || '';
        // Ignore browser extension errors
        if (msg.includes('extension://')) return null;
        // Ignore ResizeObserver loop (benign browser quirk)
        if (msg.includes('ResizeObserver loop')) return null;
        return event;
      },
      integrations(defaults) {
        return defaults.filter(
          // Remove the default BrowserTracing if we don't need performance monitoring
          (i) => i.name !== 'BrowserTracing'
        );
      },
    });

    initialized = true;
  } catch (e) {
    // Sentry init failed — not critical, just log
    log.warn('init failed:', e);
  }
}

/**
 * Manually capture an error (e.g., from ErrorBoundary or catch blocks).
 * No-op if Sentry is not initialized.
 */
export async function captureError(error: Error, context?: Record<string, unknown>): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/react');
    if (context) {
      Sentry.withScope((scope) => {
        Object.entries(context).forEach(([key, val]) => {
          scope.setExtra(key, val);
        });
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  } catch {
    // Sentry not available — silent
  }
}
