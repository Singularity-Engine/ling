import { memo, useState, useCallback } from 'react';
import { useInViewport } from '../../hooks/useInViewport';
import { ActionCard } from './ActionCard';
import type { ActionCard as ActionCardData } from '../../data/sngxai-actions';
import styles from './Screen2.module.css';

interface Screen2Props {
  actions: ActionCardData[];
}

const VISIBLE_COUNT = 6;

export const Screen2 = memo(function Screen2({ actions }: Screen2Props) {
  const { ref, inViewport } = useInViewport<HTMLElement>({ threshold: 0.2 });
  const [page, setPage] = useState(0);

  const maxPage = Math.max(0, Math.ceil(actions.length / VISIBLE_COUNT) - 1);
  const visibleActions = actions.slice(page * VISIBLE_COUNT, (page + 1) * VISIBLE_COUNT);

  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const next = useCallback(() => setPage((p) => Math.min(maxPage, p + 1)), [maxPage]);

  return (
    <section className={styles.root} ref={ref} aria-label="Recent actions">
      <picture className={styles.heroBg} aria-hidden="true">
        <source srcSet="/hero-screen2.webp?v=4" type="image/webp" />
        <img src="/hero-screen2.webp?v=4" alt="" loading="lazy" decoding="async" />
      </picture>

      <h2 className={styles.headline} data-voice="ling">
        What Ling has been doing
      </h2>

      <div className={styles.journal}>
        {visibleActions.map((card, i) => (
          <div key={card.id} className={styles.journalEntry}>
            <ActionCard card={card} visible={inViewport} index={i} />
          </div>
        ))}
      </div>

      {maxPage > 0 && (
        <div className={styles.navRow}>
          <button
            className={styles.navBtn}
            onClick={prev}
            disabled={page === 0}
            aria-label="Previous actions"
          >
            ←
          </button>
          <button
            className={styles.navBtn}
            onClick={next}
            disabled={page === maxPage}
            aria-label="Next actions"
          >
            →
          </button>
        </div>
      )}
    </section>
  );
});
