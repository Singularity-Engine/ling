/**
 * Cached `prefers-reduced-motion` query.
 *
 * Instead of allocating a new `MediaQueryList` on every call site,
 * we read once at module load and keep the value up-to-date via the
 * media query `change` event.
 */

let _cached =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (e) => {
      _cached = e.matches;
    });
}

/** Returns `true` when the user's OS-level reduced-motion setting is active. */
export function prefersReducedMotion(): boolean {
  return _cached;
}
