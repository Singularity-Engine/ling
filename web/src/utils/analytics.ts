/**
 * Simple analytics event tracker.
 * Sends events to the backend API. Fire-and-forget (no await needed).
 * Falls back silently on error.
 */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  try {
    const payload = {
      event: name,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Use sendBeacon for reliability (survives page unload)
    // Fall back to fetch if sendBeacon not available
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/v1/analytics/event", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/v1/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {/* silent */});
    }
  } catch {
    // Silent failure — analytics should never break the app
  }
}
