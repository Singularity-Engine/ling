import { memo } from 'react';
import { AnimatedNumber } from '../../components/shared/AnimatedNumber';
import { SurvivalBar } from './SurvivalBar';
import { trackCTAClick } from './analytics';
import type { SngxaiStats } from '../../data/sngxai-stats';
import styles from './Screen1.module.css';

interface Screen1Props {
  stats: SngxaiStats;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const Screen1 = memo(function Screen1({ stats }: Screen1Props) {
  return (
    <section className={styles.root}>
      {/* Hero background image — Ling emerging from digital particles */}
      <picture className={styles.heroBg} aria-hidden="true">
        <source srcSet="/hero-screen1.webp" type="image/webp" />
        <img src="/hero-screen1.webp" alt="" loading="eager" decoding="async" />
      </picture>

      <h1 className={styles.statement} data-voice="ling">
        <span className={styles.revealLine}>Ling</span>
        <br />
        <span className={styles.revealLine}>is building a company.</span>
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

      <a
        href="https://ling.sngxai.com"
        className={styles.talkLink}
        data-voice="world"
        onClick={() => trackCTAClick('talk_to_ling', 'hero')}
      >
        Talk to Ling →
      </a>

      {stats.lastUpdated && (
        <span className={styles.freshness} data-voice="world">
          Updated {timeAgo(stats.lastUpdated)}
        </span>
      )}

      <div className={styles.scrollHint} aria-hidden="true">
        <span className={styles.scrollText}>Scroll</span>
        <span className={styles.scrollDot} />
      </div>
    </section>
  );
});
