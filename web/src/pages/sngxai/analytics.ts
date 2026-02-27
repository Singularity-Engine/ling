/**
 * sngxai.com analytics — screen visibility + CTA tracking.
 * GA4 only (static site, no backend beacon endpoint).
 * All events are throttled to avoid noise.
 */

import { trackEvent as ga4Track } from '../../lib/analytics';

const SCREEN_NAMES = ['hero', 'actions', 'stakes', 'growth', 'pricing'] as const;

/** Fire to GA4 (sngxai.com is static — no backend beacon endpoint) */
function track(name: string, params?: Record<string, string | number | boolean>): void {
  ga4Track(name, params);
}

// Throttle: only fire each screen_view once per session
const viewedScreens = new Set<number>();

/**
 * Track when a screen becomes visible.
 * Called by SngxaiApp's IntersectionObserver.
 */
export function trackScreenView(index: number): void {
  if (viewedScreens.has(index)) return;
  viewedScreens.add(index);
  track('sngxai_screen_view', {
    screen_index: index,
    screen_name: SCREEN_NAMES[index] ?? `screen_${index}`,
  });
}

/**
 * Track CTA clicks (Talk to Ling, pricing tiers, action cards).
 */
export function trackCTAClick(label: string, destination?: string): void {
  track('sngxai_cta_click', {
    cta_label: label,
    ...(destination ? { cta_destination: destination } : {}),
  });
}

/**
 * Track pricing tier clicks.
 */
export function trackTierClick(tierName: string, price: string): void {
  track('sngxai_tier_click', {
    tier_name: tierName,
    tier_price: price,
  });
}

/**
 * Track scroll depth (fired once when user reaches bottom).
 */
let scrollCompleteTracked = false;
export function trackScrollComplete(): void {
  if (scrollCompleteTracked) return;
  scrollCompleteTracked = true;
  track('sngxai_scroll_complete', {
    screens_viewed: viewedScreens.size,
  });
}
