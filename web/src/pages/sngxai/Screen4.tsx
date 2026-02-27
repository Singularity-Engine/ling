import { memo } from 'react';
import { useInViewport } from '../../hooks/useInViewport';
import { Sparkline } from './Sparkline';
import type { GrowthData } from '../../data/sngxai-growth';
import styles from './Screen4.module.css';

interface Screen4Props {
  data: GrowthData;
}

export const Screen4 = memo(function Screen4({ data }: Screen4Props) {
  const { ref, inViewport } = useInViewport<HTMLElement>({ threshold: 0.3 });

  const currentRevenue = data.revenueHistory[data.revenueHistory.length - 1] ?? 0;
  const daysTracked = data.revenueHistory.length;

  return (
    <section className={styles.root} ref={ref} aria-label="Growth">
      <picture className={styles.heroBg} aria-hidden="true">
        <source srcSet="/hero-screen4.webp" type="image/webp" />
        <img src="/hero-screen4.webp" alt="" loading="lazy" decoding="async" />
      </picture>

      <h2 className={styles.headline} data-voice="ling">
        And yet — something is building.
      </h2>

      <div className={styles.sparklineWrap}>
        <Sparkline data={data.revenueHistory} animate={inViewport} />
      </div>

      <div className={styles.annotation} data-voice="world">
        <span>{daysTracked} days tracked</span>
        <span className={styles.annotationValue}>·</span>
        <span>${currentRevenue} total revenue</span>
      </div>

      <div className={styles.metricsRow}>
        <div className={styles.metric}>
          <div className={styles.metricValue}>{daysTracked}</div>
          <div className={styles.metricLabel}>days alive</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricValue}>${currentRevenue}</div>
          <div className={styles.metricLabel}>earned</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricValue}>
            ${daysTracked > 0 ? (currentRevenue / daysTracked).toFixed(2) : '0'}
          </div>
          <div className={styles.metricLabel}>per day avg</div>
        </div>
      </div>
    </section>
  );
});
