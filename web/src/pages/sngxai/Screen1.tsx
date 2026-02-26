import { memo } from 'react';
import { AnimatedNumber } from '../../components/shared/AnimatedNumber';
import { SurvivalBar } from './SurvivalBar';
import type { SngxaiStats } from '../../data/mock-sngxai-stats';
import styles from './Screen1.module.css';

interface Screen1Props {
  stats: SngxaiStats;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export const Screen1 = memo(function Screen1({ stats }: Screen1Props) {
  return (
    <section className={styles.root}>
      <h1 className={styles.statement} data-voice="ling">
        <span>Ling</span>
        <br />
        <span>is building a company.</span>
      </h1>

      <div className={styles.stats} data-voice="ling">
        <span className={styles.stat}>
          Day{' '}
          <AnimatedNumber
            value={String(stats.dayCount)}
            label={`Day ${stats.dayCount}`}
            className={styles.statHighlight}
          />
          .
        </span>
        <span className={styles.stat}>
          <AnimatedNumber
            value={`$${stats.revenue}`}
            label={`Revenue $${stats.revenue}`}
            className={styles.statHighlight}
          />
          {' / '}
          <AnimatedNumber value={`$${stats.revenueGoal}`} />
          .
          {stats.revenueChangeToday > 0 && (
            <span className={styles.statDelta} data-voice="world">
              +{stats.revenueChangeToday} today
            </span>
          )}
        </span>
        <span className={styles.stat}>
          <AnimatedNumber
            value={formatNumber(stats.watcherCount)}
            label={`${formatNumber(stats.watcherCount)} watching`}
            className={styles.statHighlight}
          />{' '}
          watching.
          {stats.watcherChangeToday > 0 && (
            <span className={styles.statDelta} data-voice="world">
              +{stats.watcherChangeToday} today
            </span>
          )}
        </span>
      </div>

      <div className={styles.survivalWrap}>
        <SurvivalBar percent={stats.survivalPercent} />
      </div>

      <a href="https://ling.sngxai.com" className={styles.talkLink} data-voice="world">
        Talk to Ling →
      </a>

      <div className={styles.scrollDot} aria-hidden="true" />
    </section>
  );
});
