/**
 * Google Analytics 4 (gtag.js)
 *
 * Set VITE_GA_ID (e.g. "G-XXXXXXXXXX") to enable.
 * No-op if env var is not set.
 */

let initialized = false;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function initAnalytics(): void {
  const id = import.meta.env.VITE_GA_ID;
  if (!id || initialized) return;

  // gtag.js loader
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  // gtag init
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id);

  initialized = true;
}

/**
 * Track a custom event.
 *
 * Usage:
 *   trackEvent('language_switch', { from: 'en', to: 'ja' });
 *   trackEvent('chat_send');
 *   trackEvent('signup_complete');
 */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
}
