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

/**
 * Fullscreen transition guard — when a fullscreen toggle happens, the browser
 * fires resize events while the viewport is still animating. Without this
 * guard, the desktop breakpoint can flip (OverlayLayout ↔ SplitLayout),
 * causing full component unmount/remount cascades (Live2D reinit, WebSocket
 * side-effects, duplicate greetings, etc.).
 *
 * Strategy: suppress _isDesktop changes during the settling window (800ms)
 * after a fullscreenchange event. After settling, do one final check to
 * apply the correct state.
 */
let _isFullscreenSettling = false;
let _settleTimer: ReturnType<typeof setTimeout> | null = null;

function _notifyListeners() {
  _listeners.forEach(fn => fn());
}

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

    const mobileChanged = nextMobile !== _isMobile;
    const desktopChanged = nextDesktop !== _isDesktop;

    // Always update mobile state immediately
    if (mobileChanged) _isMobile = nextMobile;

    // During fullscreen transitions, suppress desktop state changes to
    // prevent layout thrashing from component unmount/remount cascades.
    // The settle timer callback will apply the final state.
    if (desktopChanged && !_isFullscreenSettling) {
      _isDesktop = nextDesktop;
    }

    if (mobileChanged || (desktopChanged && !_isFullscreenSettling)) {
      _notifyListeners();
    }
  });
}

// Fullscreen transitions may not fire `resize` in all browsers.
// Listen for fullscreenchange — gate desktop changes during settle window.
function _onFullscreenChange() {
  _isFullscreenSettling = true;
  if (_settleTimer) clearTimeout(_settleTimer);
  _settleTimer = setTimeout(() => {
    _isFullscreenSettling = false;
    _settleTimer = null;
    // Final check with settled viewport dimensions
    const w = window.innerWidth;
    const nextMobile = w < MOBILE_BREAKPOINT;
    const nextDesktop = _isDesktop
      ? w >= SPLIT_BREAKPOINT
      : w >= SPLIT_BREAKPOINT + SPLIT_HYSTERESIS;
    const changed = nextMobile !== _isMobile || nextDesktop !== _isDesktop;
    if (changed) {
      _isMobile = nextMobile;
      _isDesktop = nextDesktop;
      _notifyListeners();
    }
  }, 800);
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
      if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; _isFullscreenSettling = false; }
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
