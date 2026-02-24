import { useCallback, useRef, useState, type RefObject } from "react";

/**
 * Swipe-to-collapse gesture for mobile chat panel.
 *
 * Detects overscroll (scrollTop <= 0) + downward drag > threshold → collapse.
 * Spring-like rubber-band effect during drag.
 * Compatible with react-virtuoso: only activates when at scroll top.
 */

const COLLAPSE_THRESHOLD = 80; // px: drag distance to trigger collapse
const PILL_APPEAR_THRESHOLD = 20; // px: drag distance before pill appears
const SPRING_RESISTANCE = 0.4; // rubber-band resistance factor

interface UseSwipeCollapseOptions {
  scrollRef: RefObject<HTMLElement | null>;
  onCollapse: () => void;
  enabled?: boolean;
}

interface SwipeCollapseState {
  dragOffset: number;
  isDragging: boolean;
  showPill: boolean;
}

const IDLE_STATE: SwipeCollapseState = { dragOffset: 0, isDragging: false, showPill: false };

export function useSwipeCollapse({ scrollRef, onCollapse, enabled = true }: UseSwipeCollapseOptions) {
  const [state, setState] = useState<SwipeCollapseState>(IDLE_STATE);

  const gestureRef = useRef({ startY: 0, isActive: false, isDragging: false, dragOffset: 0 });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    const el = scrollRef.current;
    // Only activate when scrolled to top
    if (!el || el.scrollTop > 0) return;
    gestureRef.current.startY = e.touches[0].clientY;
    gestureRef.current.isActive = true;
  }, [enabled, scrollRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!gestureRef.current.isActive || !enabled) return;
    const el = scrollRef.current;
    // Deactivate if user scrolled away from top
    if (el && el.scrollTop > 0) {
      gestureRef.current.isActive = false;
      if (gestureRef.current.isDragging) {
        gestureRef.current.isDragging = false;
        setState(IDLE_STATE);
      }
      return;
    }

    const deltaY = e.touches[0].clientY - gestureRef.current.startY;
    if (deltaY < PILL_APPEAR_THRESHOLD) {
      // Not enough drag yet, or dragging upward
      if (gestureRef.current.isDragging) {
        gestureRef.current.isDragging = false;
        setState(IDLE_STATE);
      }
      return;
    }

    // Apply rubber-band resistance
    const offset = deltaY * SPRING_RESISTANCE;
    gestureRef.current.isDragging = true;
    gestureRef.current.dragOffset = offset;
    setState({
      dragOffset: offset,
      isDragging: true,
      showPill: deltaY >= PILL_APPEAR_THRESHOLD,
    });
  }, [enabled, scrollRef]);

  const onTouchEnd = useCallback(() => {
    if (!gestureRef.current.isDragging) {
      gestureRef.current.isActive = false;
      return;
    }

    // Read from ref to avoid stale closure over state.dragOffset
    const finalDelta = gestureRef.current.dragOffset / SPRING_RESISTANCE;
    gestureRef.current.isDragging = false;
    gestureRef.current.isActive = false;
    gestureRef.current.dragOffset = 0;

    if (finalDelta >= COLLAPSE_THRESHOLD) {
      onCollapse();
    }

    // Reset state (spring back)
    setState(IDLE_STATE);
  }, [onCollapse]);

  return {
    ...state,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
