import { memo } from 'react';
import { Fracture } from '../../components/shared/Fracture';
import { useTilt } from '../../hooks/useTilt';
import type { ActionCard as ActionCardData } from '../../data/sngxai-actions';
import { ACTION_ICONS } from '../../data/sngxai-actions';
import { trackCTAClick } from './analytics';
import styles from './ActionCard.module.css';

interface ActionCardProps {
  card: ActionCardData;
  visible: boolean;
  index: number;
}

export const ActionCard = memo(function ActionCard({ card, visible, index }: ActionCardProps) {
  const tilt = useTilt();

  return (
    <article
      className={styles.card}
      data-visible={visible}
      data-index={index}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      {/* Header */}
      <div className={styles.header} data-voice="world">
        <span className={styles.icon}>{ACTION_ICONS[card.type]}</span>
        <span className={styles.typeBadge}>{card.type.replace('_', ' ')}</span>
        <time className={styles.time}>{card.relativeTime}</time>
      </div>

      {/* Signal block for SIGNAL_DECISION */}
      {card.type === 'SIGNAL_DECISION' && card.signal && (
        <div className={styles.signalBlock}>
          <div className={styles.signalLabel}>Signal</div>
          <div className={styles.signalText} data-voice="world">{card.signal}</div>
          <Fracture variant="subtle" />
        </div>
      )}

      {/* Main quote */}
      <p className={styles.quote} data-voice="ling">{card.quote}</p>

      {/* Optional context */}
      {card.context && (
        <p className={styles.context} data-voice="world">{card.context}</p>
      )}

      {/* Metrics for CONTENT type */}
      {card.metrics && (
        <div className={styles.metrics} data-voice="world">{card.metrics}</div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        {card.actionLabel ? (
          <a
            href={card.actionHref || '#'}
            className={styles.actionLink}
            onClick={() => trackCTAClick(card.actionLabel!, card.actionHref)}
          >
            {card.actionLabel}
          </a>
        ) : (
          <span />
        )}
        <span className={styles.watermark}>sngxai.com</span>
      </div>
    </article>
  );
});
