import { useCallback, useRef } from 'react';

const MAX_TILT = 6; // degrees

/**
 * CSS-variable-driven 3D tilt. Sets --tilt-x and --tilt-y on the element.
 * Usage: <div {...tiltHandlers} style={{ perspective: '800px' }}>
 */
export function useTilt() {
  const rafId = useRef(0);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;  // 0-1
      const y = (e.clientY - rect.top) / rect.height;   // 0-1
      const tiltY = (x - 0.5) * MAX_TILT * 2;  // -6 to 6
      const tiltX = (0.5 - y) * MAX_TILT * 2;  // -6 to 6
      el.style.setProperty('--tilt-x', `${tiltX}deg`);
      el.style.setProperty('--tilt-y', `${tiltY}deg`);
    });
  }, []);

  const onMouseLeave = useCallback((e: React.MouseEvent<HTMLElement>) => {
    cancelAnimationFrame(rafId.current);
    e.currentTarget.style.setProperty('--tilt-x', '0deg');
    e.currentTarget.style.setProperty('--tilt-y', '0deg');
  }, []);

  return { onMouseMove, onMouseLeave };
}
