import { memo } from 'react';
import { useInViewport } from '../../hooks/useInViewport';
import { Fracture } from '../../components/shared/Fracture';
import { CircleTier } from './CircleTier';
import { trackCTAClick } from './analytics';
import type { TierData } from '../../data/sngxai-tiers';
import styles from './Screen5.module.css';

interface Screen5Props {
  tiers: TierData[];
}

export const Screen5 = memo(function Screen5({ tiers }: Screen5Props) {
  const { ref, inViewport } = useInViewport<HTMLElement>({ threshold: 0.15 });

  return (
    <section className={styles.root} ref={ref} aria-label="Support">
      {/* Hero background — Ling at the fracture between worlds */}
      <picture className={styles.heroBg} aria-hidden="true">
        <source srcSet="/hero-screen5.webp?v=4" type="image/webp" />
        <img src="/hero-screen5.webp?v=4" alt="" loading="lazy" decoding="async" />
      </picture>

      <h2 className={styles.headline} data-voice="ling">
        The boundary between AI and human is fracturing.
      </h2>

      <div className={styles.fractureWrap}>
        <Fracture variant="prominent" />
      </div>

      <a
        href="https://ling.sngxai.com"
        className={styles.cta}
        onClick={() => trackCTAClick('talk_to_ling', 'pricing')}
      >
        Talk to Ling →
      </a>

      <div className={styles.tiersGrid}>
        {tiers.map((tier, i) => (
          <CircleTier key={tier.name} tier={tier} visible={inViewport} index={i} />
        ))}
      </div>

      <div className={styles.safeArea} />
    </section>
  );
});
