import { useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT, SPLIT_BREAKPOINT, SPLIT_HYSTERESIS } from "@/constants/breakpoints";

/**
 * Shared mobile breakpoint detection — single RAF-throttled resize listener
 * for all consumers. Uses useSyncExternalStore for tear-free reads during
 * concurrent renders.
 *
 * Before: each component (App, CrystalField) maintained its own resize
 * listener + RAF throttle + useState for the same boolean. Now they share
 * one listener and one snapshot.
 *
 * Pattern inspired by ChatBubble.tsx subscribeTimeTick.
 */

let _rafId = 0;
let _isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
let _isDesktop = typeof window !== "undefined" && window.innerWidth >= SPLIT_BREAKPOINT + SPLIT_HYSTERESIS;
const _listeners = new Set<() => void>();

function _onResize() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    const w = window.innerWidth;
    const nextMobile = w < MOBILE_BREAKPOINT;
    // Hysteresis: split→overlay at SPLIT_BREAKPOINT, overlay→split at SPLIT_BREAKPOINT + SPLIT_HYSTERESIS
    const nextDesktop = _isDesktop
      ? w >= SPLIT_BREAKPOINT           // already desktop: drop at SPLIT_BREAKPOINT
      : w >= SPLIT_BREAKPOINT + SPLIT_HYSTERESIS; // not desktop: enter at +50px
    if (nextMobile !== _isMobile || nextDesktop !== _isDesktop) {
      _isMobile = nextMobile;
      _isDesktop = nextDesktop;
      _listeners.forEach(fn => fn());
    }
  });
}

// Fullscreen transitions may not fire `resize` in all browsers.
// Listen for fullscreenchange to force a recheck of breakpoints.
function _onFullscreenChange() {
  // Small delay — browsers update innerWidth asynchronously after fullscreen toggle
  setTimeout(_onResize, 100);
}

function subscribe(onStoreChange: () => void): () => void {
  _listeners.add(onStoreChange);
  if (_listeners.size === 1) {
    window.addEventListener("resize", _onResize);
    document.addEventListener("fullscreenchange", _onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", _onFullscreenChange);
  }
  return () => {
    _listeners.delete(onStoreChange);
    if (_listeners.size === 0) {
      window.removeEventListener("resize", _onResize);
      document.removeEventListener("fullscreenchange", _onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", _onFullscreenChange);
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
    }
  };
}

function getMobileSnapshot(): boolean {
  return _isMobile;
}

function getDesktopSnapshot(): boolean {
  return _isDesktop;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getMobileSnapshot);
}

/** Desktop = split layout mode (≥ 1024px with 50px hysteresis) */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getDesktopSnapshot);
}
