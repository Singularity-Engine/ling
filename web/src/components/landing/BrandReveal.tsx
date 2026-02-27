import { memo, useEffect, useRef } from 'react';
import styles from './BrandReveal.module.css';

interface BrandRevealProps {
  onComplete: () => void;
}

const DURATION_MS = 2300; // 0.3s delay + 1.5s letter + 0.5s fade
const REDUCED_MOTION_MS = 700;

export const BrandReveal = memo(function BrandReveal({ onComplete }: BrandRevealProps) {
  const completedRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? REDUCED_MOTION_MS : DURATION_MS;
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={styles.root}>
      <span className={styles.text}>Ling</span>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        Loading...
      </div>
    </div>
  );
});
