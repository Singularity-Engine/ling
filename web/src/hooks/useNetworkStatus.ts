import { useSyncExternalStore } from "react";

/**
 * Shared online/offline detection — single pair of event listeners for all
 * consumers. Uses useSyncExternalStore for tear-free reads during concurrent
 * renders (same pattern as useIsMobile).
 */

let _isOnline = typeof window !== "undefined" ? navigator.onLine : true;
const _listeners = new Set<() => void>();

function _handleOnline() {
  if (_isOnline) return;
  _isOnline = true;
  _listeners.forEach(fn => fn());
}

function _handleOffline() {
  if (!_isOnline) return;
  _isOnline = false;
  _listeners.forEach(fn => fn());
}

function subscribe(onStoreChange: () => void): () => void {
  _listeners.add(onStoreChange);
  if (_listeners.size === 1) {
    window.addEventListener("online", _handleOnline);
    window.addEventListener("offline", _handleOffline);
  }
  return () => {
    _listeners.delete(onStoreChange);
    if (_listeners.size === 0) {
      window.removeEventListener("online", _handleOnline);
      window.removeEventListener("offline", _handleOffline);
    }
  };
}

function getSnapshot(): boolean {
  return _isOnline;
}

export function useNetworkStatus(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);
  return { isOnline };
}
