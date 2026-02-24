/**
 * Minimal event tracking utility.
 * Sends events to analytics if available (GA / Mixpanel / custom),
 * otherwise logs to console in development.
 *
 * Usage: trackEvent("message_sent", { source: "input_bar" })
 */

type EventPayload = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, payload?: EventPayload): void {
  // Google Analytics 4
  if (typeof window !== "undefined" && "gtag" in window) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", name, payload);
    return;
  }

  // Mixpanel
  if (typeof window !== "undefined" && "mixpanel" in window) {
    (window as unknown as { mixpanel: { track: (n: string, p?: EventPayload) => void } }).mixpanel.track(name, payload);
    return;
  }

  // Development fallback — console log
  if (import.meta.env.DEV) {
    console.debug("[track]", name, payload);
  }
}
