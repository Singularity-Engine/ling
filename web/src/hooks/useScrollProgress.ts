import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Returns scroll progress (0 → 1) of an element relative to a scroll container.
 * Used for parallax effects: translateY = progress * rate * maxOffset.
 */
export function useScrollProgress<T extends HTMLElement>(containerSelector?: string) {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const rafId = useRef(0);

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;

      const container = containerSelector
        ? document.querySelector(containerSelector)
        : el.closest('[style*="overflow"]') || el.parentElement;

      if (!container) return;

      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const totalTravel = containerRect.height + rect.height;

      // How far through the viewport the element has traveled
      const traveled = containerRect.bottom - rect.top;
      const p = Math.max(0, Math.min(1, traveled / totalTravel));
      setProgress(p);
    });
  }, [containerSelector]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const container = containerSelector
      ? document.querySelector(containerSelector)
      : el.closest('[style*="overflow"]') || el.parentElement;

    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial measurement

    return () => {
      container.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [handleScroll, containerSelector]);

  return { ref, progress };
}
