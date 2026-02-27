import { useState, useRef, useEffect, useCallback } from 'react';
import { BreathingBackground } from '../../components/shared/BreathingBackground';
import { FilmGrain } from './FilmGrain';
import { ScrollIndicator } from './ScrollIndicator';
import { Screen1 } from './Screen1';
import { Screen2 } from './Screen2';
import { Screen3 } from './Screen3';
import { Screen4 } from './Screen4';
import { Screen5 } from './Screen5';
import { getLiveStats } from '../../data/sngxai-stats';
import { getCuratedActions } from '../../data/sngxai-actions';
import { getLiveStakes } from '../../data/sngxai-stakes';
import { getLiveGrowth } from '../../data/sngxai-growth';
import { getTiers } from '../../data/sngxai-tiers';
import { trackScreenView, trackScrollComplete } from './analytics';
import styles from './SngxaiApp.module.css';

const stats = getLiveStats();
const actions = getCuratedActions();
const stakes = getLiveStakes();
const growthData = getLiveGrowth();
const tiers = getTiers();

const TOTAL_SCREENS = 5;

export function SngxaiApp() {
  const [activeIndex, setActiveIndex] = useState(0);
  const screenRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = screenRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = els.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) {
              setActiveIndex(idx);
              trackScreenView(idx);
              if (idx === TOTAL_SCREENS - 1) trackScrollComplete();
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((index: number) => {
    screenRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const setRef = (index: number) => (el: HTMLDivElement | null) => {
    screenRefs.current[index] = el;
  };

  return (
    <>
      <BreathingBackground />
      <FilmGrain />
      <ScrollIndicator totalScreens={TOTAL_SCREENS} activeIndex={activeIndex} onDotClick={scrollTo} />
      <main className={styles.container} ref={containerRef}>
        <div className={styles.screen} ref={setRef(0)}><Screen1 stats={stats} /></div>
        <div className={styles.screen} ref={setRef(1)}><Screen2 actions={actions} /></div>
        <div className={styles.screen} ref={setRef(2)}><Screen3 stakes={stakes} /></div>
        <div className={styles.screen} ref={setRef(3)}><Screen4 data={growthData} /></div>
        <div className={styles.screen} ref={setRef(4)}><Screen5 tiers={tiers} /></div>
      </main>
    </>
  );
}
