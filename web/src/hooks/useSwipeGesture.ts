import { useEffect, useRef } from "react";

/**
 * Generic swipe-gesture hook using native touch events.
 *
 * Detects a swipe in the configured direction on the target element.
 * Uses passive listeners for scroll performance.
 * Fires `onSwipe` once per completed gesture (on touchend).
 */

export type SwipeDirection = "up" | "down" | "left" | "right";

export interface SwipeConfig {
  /** Which direction triggers the swipe callback */
  direction: SwipeDirection;
  /** Minimum travel distance in px (default: 30) */
  threshold?: number;
  /** Max angular deviation from the target direction in degrees (default: 30) */
  angleThreshold?: number;
  /** Called once when a qualifying swipe gesture completes */
  onSwipe: () => void;
  /** Disable the gesture without removing the hook (default: true) */
  enabled?: boolean;
}

// Pre-computed target angles in radians for each direction
const TARGET_ANGLE: Record<SwipeDirection, number> = {
  right: 0,
  up: -Math.PI / 2,
  left: Math.PI,
  down: Math.PI / 2,
};

/**
 * Attach a swipe-gesture detector to a ref'd element.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * useSwipeGesture(ref, {
 *   direction: "up",
 *   threshold: 40,
 *   onSwipe: () => expandChat(),
 * });
 * return <div ref={ref}>...</div>;
 * ```
 */
export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  config: SwipeConfig,
): void {
  // Keep config in a ref so event handlers always see the latest values
  // without needing to re-attach listeners on every render.
  const cfgRef = useRef(config);
  cfgRef.current = config;

  // Touch start coordinates
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(e: TouchEvent) {
      const cfg = cfgRef.current;
      if (cfg.enabled === false) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const threshold = cfg.threshold ?? 30;
      if (distance < threshold) return;

      // Angle of the actual swipe (atan2 returns radians: right=0, down=+PI/2, up=-PI/2)
      const swipeAngle = Math.atan2(dy, dx);
      const target = TARGET_ANGLE[cfg.direction];

      // Angular difference, wrapped to [-PI, PI]
      let diff = swipeAngle - target;
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;

      const angleThreshold = ((cfg.angleThreshold ?? 30) * Math.PI) / 180;
      if (Math.abs(diff) <= angleThreshold) {
        cfg.onSwipe();
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [ref]);
}
