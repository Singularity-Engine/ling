import { memo } from 'react';
import { useTilt } from '../../hooks/useTilt';
import type { TierData } from '../../data/sngxai-tiers';
import { trackTierClick } from './analytics';
import styles from './CircleTier.module.css';

interface CircleTierProps {
  tier: TierData;
  visible: boolean;
  index: number;
}

export const CircleTier = memo(function CircleTier({ tier, visible, index }: CircleTierProps) {
  const tilt = useTilt();

  return (
    <div
      className={`${styles.card} ${tier.recommended ? styles.recommended : ''}`}
      data-visible={visible}
      data-index={index}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      {tier.recommended && (
        <span className={styles.badge}>Start here</span>
      )}

      <div className={styles.priceBlock}>
        <span className={styles.price}>{tier.price}</span>
        {tier.pricePeriod && (
          <span className={styles.period}>{tier.pricePeriod}</span>
        )}
      </div>

      <h3 className={styles.name} data-voice="ling">{tier.name}</h3>

      <p className={styles.benefit} data-voice="world">{tier.benefit}</p>

      <a
        href="https://ling.sngxai.com"
        className={`${styles.tierCta} ${tier.recommended ? styles.tierCtaPrimary : ''}`}
        onClick={() => trackTierClick(tier.name, tier.price)}
      >
        {tier.price === '$0' ? 'Enter free' : 'Choose'}
      </a>
    </div>
  );
});
