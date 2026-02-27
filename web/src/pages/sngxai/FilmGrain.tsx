import styles from './FilmGrain.module.css';

/** Subtle analog film grain overlay — sits on top of everything, pointer-events: none */
export function FilmGrain() {
  return <div className={styles.grain} aria-hidden="true" />;
}
