import { memo } from 'react';
import styles from './AnimatedNumber.module.css';

interface AnimatedNumberProps {
  value: string;
  label?: string;
  className?: string;
}

const STAGGER_MS = 30;

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  label,
  className,
}: AnimatedNumberProps) {
  return (
    <span
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      aria-label={label}
    >
      {value.split('').map((char, i) => (
        <span
          key={`${i}-${char}`}
          data-char={char}
          className={styles.char}
          style={{ animationDelay: `${i * STAGGER_MS}ms` }}
          aria-hidden="true"
        >
          {char}
        </span>
      ))}
    </span>
  );
});
