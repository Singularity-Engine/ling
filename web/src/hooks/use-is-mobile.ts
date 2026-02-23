import { useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT } from "@/constants/breakpoints";

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
const _listeners = new Set<() => void>();

function _onResize() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    const next = window.innerWidth < MOBILE_BREAKPOINT;
    if (next !== _isMobile) {
      _isMobile = next;
      _listeners.forEach(fn => fn());
    }
  });
}

function subscribe(onStoreChange: () => void): () => void {
  _listeners.add(onStoreChange);
  if (_listeners.size === 1) {
    window.addEventListener("resize", _onResize);
  }
  return () => {
    _listeners.delete(onStoreChange);
    if (_listeners.size === 0) {
      window.removeEventListener("resize", _onResize);
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
    }
  };
}

function getSnapshot(): boolean {
  return _isMobile;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
