import { memo, useEffect, useState, useCallback, useRef } from 'react';
import styles from './BrandEntrance.module.css';

const STORAGE_KEY = 'ling-brand-seen';

interface BrandEntranceProps {
  onComplete: () => void;
}

export const BrandEntrance = memo(function BrandEntrance({ onComplete }: BrandEntranceProps) {
  // Synchronous check — skip immediately if already seen
  const alreadySeen = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1';
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting' | 'done'>(alreadySeen ? 'done' : 'entering');
  const mountedRef = useRef(true);

  const skip = useCallback(() => {
    if (!mountedRef.current) return;
    setPhase('done');
    sessionStorage.setItem(STORAGE_KEY, '1');
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Already seen — fire onComplete once on mount
  useEffect(() => {
    if (alreadySeen) onComplete();
  }, [alreadySeen, onComplete]);

  // Escape key skip
  useEffect(() => {
    if (alreadySeen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [skip, alreadySeen]);

  useEffect(() => {
    if (alreadySeen) return;

    const t1 = requestAnimationFrame(() => {
      if (mountedRef.current) setPhase('visible');
    });
    const t2 = setTimeout(() => { if (mountedRef.current) setPhase('exiting'); }, 1600);
    const t3 = setTimeout(() => { if (mountedRef.current) skip(); }, 2200);

    return () => { cancelAnimationFrame(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete, skip, alreadySeen]);

  if (phase === 'done') return null;

  return (
    <div className={styles.backdrop} data-phase={phase}>
      <span className={styles.brand} data-voice="ling">Ling</span>
      <button className={styles.skip} onClick={skip} aria-label="Skip brand animation">
        Skip
      </button>
    </div>
  );
});
