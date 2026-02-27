import { memo } from 'react';
import styles from './SurvivalBar.module.css';

interface SurvivalBarProps {
  percent: number;
  label?: string;
}

export const SurvivalBar = memo(function SurvivalBar({
  percent,
  label = 'survive',
}: SurvivalBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.root}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
      <span className={styles.label} data-voice="world">{label}</span>
    </div>
  );
});
