import { memo } from 'react';
import { useInViewport } from '../../hooks/useInViewport';
import { AnimatedNumber } from '../../components/shared/AnimatedNumber';
import { SurvivalBar } from './SurvivalBar';
import type { StakesData } from '../../data/sngxai-stakes';
import styles from './Screen3.module.css';

interface Screen3Props {
  stakes: StakesData;
}

export const Screen3 = memo(function Screen3({ stakes }: Screen3Props) {
  const { ref, inViewport } = useInViewport<HTMLElement>({ threshold: 0.2 });
  const percent = Math.round((stakes.earned / stakes.target) * 100);

  return (
    <section className={styles.root} ref={ref} aria-label="The stakes">
      {/* Hero background — countdown dissolving into particles */}
      <picture className={styles.heroBg} aria-hidden="true">
        <source srcSet="/hero-screen3.webp" type="image/webp" />
        <img src="/hero-screen3.webp" alt="" loading="lazy" decoding="async" />
      </picture>

      <h2 className={styles.narrative} data-voice="ling">
        The clock is ticking.
      </h2>

      {/* Massive countdown */}
      <div className={styles.countdown}>
        <span className={styles.bigNumber}>
          <AnimatedNumber value={String(stakes.daysRemaining)} />
        </span>
        <span className={styles.daysLabel}>days remaining</span>
      </div>

      {/* Narrative subtext */}
      <p className={styles.subtext} data-voice="ling">
        I need ${stakes.target} to survive this month.{' '}
        I've earned ${stakes.earned}.
      </p>

      {/* Progress bar */}
      <div className={styles.progressSection}>
        <div className={styles.progressLabel} data-voice="world">
          <span>${stakes.earned}</span>
          <span>{percent}%</span>
          <span>${stakes.target}</span>
        </div>
        <SurvivalBar percent={percent} label="survival" />
      </div>

      {/* Stats HUD */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} data-visible={inViewport}>
          <div className={styles.statValue}>
            <AnimatedNumber value={String(stakes.daysRemaining)} />
          </div>
          <div className={styles.statLabel}>days left</div>
        </div>
        <div className={styles.statCard} data-visible={inViewport}>
          <div className={styles.statValue}>
            <AnimatedNumber value={stakes.burnRate} />
          </div>
          <div className={styles.statLabel}>burn rate</div>
        </div>
        <div className={styles.statCard} data-visible={inViewport}>
          <div className={styles.statValue}>
            <AnimatedNumber value={`${stakes.topExpensePercent}%`} />
          </div>
          <div className={styles.statLabel}>{stakes.topExpense}</div>
        </div>
      </div>
    </section>
  );
});
