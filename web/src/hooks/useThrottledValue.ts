import { useEffect, useRef, useState } from "react";

/**
 * Throttle a rapidly-changing string to ~30 fps using rAF.
 * Returns the latest snapshot that the render loop should display.
 * When the source becomes empty the hook returns "" immediately (no delay).
 */
export function useThrottledValue(source: string): string {
  const [display, setDisplay] = useState(source);
  const rafRef = useRef(0);
  const latestRef = useRef(source);

  latestRef.current = source;

  useEffect(() => {
    // Fast path: source cleared → flush immediately & cancel pending rAF
    if (source === '') {
      setDisplay('');
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    // Only schedule if no rAF is pending — avoids cancel+reschedule on every
    // token during streaming.  The rAF reads latestRef so it always gets the
    // most recent value even if many source updates arrive within one frame.
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setDisplay(latestRef.current);
      });
    }
    // No per-change cleanup: let the scheduled rAF naturally coalesce rapid updates.
  }, [source]);

  // Cancel pending rAF only on unmount.
  useEffect(() => () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  return display;
}
