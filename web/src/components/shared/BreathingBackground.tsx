import { memo } from 'react';
import styles from './BreathingBackground.module.css';

interface BreathingBackgroundProps {
  className?: string;
}

export const BreathingBackground = memo(function BreathingBackground({
  className,
}: BreathingBackgroundProps) {
  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <div className={styles.gradient} />
    </div>
  );
});
