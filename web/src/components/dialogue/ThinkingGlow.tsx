import { memo } from 'react';
import styles from './ThinkingGlow.module.css';

interface ThinkingGlowProps {
  active: boolean;
  deepThinking?: boolean;
}

export const ThinkingGlow = memo(function ThinkingGlow({
  active,
  deepThinking = false,
}: ThinkingGlowProps) {
  if (!active) return null;
  return (
    <>
      <div
        className={`${styles.glow} ${deepThinking ? styles.deep : ''}`}
        aria-hidden="true"
      />
      <span className={styles.srOnly} role="status">
        Ling is thinking{deepThinking ? ' deeply' : ''}...
      </span>
    </>
  );
});
