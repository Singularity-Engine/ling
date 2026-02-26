import { memo } from 'react';
import styles from './Fracture.module.css';

interface FractureProps {
  variant?: 'subtle' | 'prominent';
  className?: string;
}

const FRACTURE_PATH = 'M0,10 L80,9 L120,12 L200,8 L280,11 L360,7 L440,10 L520,8 L600,11 L680,9 L760,12 L840,8 L920,10 L1000,9';

export const Fracture = memo(function Fracture({
  variant = 'subtle',
  className,
}: FractureProps) {
  return (
    <svg
      className={`${styles.root} ${styles[variant]}${className ? ` ${className}` : ''}`}
      viewBox="0 0 1000 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className={styles.path} d={FRACTURE_PATH} />
    </svg>
  );
});
