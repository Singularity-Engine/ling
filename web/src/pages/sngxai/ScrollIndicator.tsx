import { memo } from 'react';
import styles from './ScrollIndicator.module.css';

interface ScrollIndicatorProps {
  totalScreens: number;
  activeIndex: number;
  onDotClick?: (index: number) => void;
}

export const ScrollIndicator = memo(function ScrollIndicator({
  totalScreens,
  activeIndex,
  onDotClick,
}: ScrollIndicatorProps) {
  return (
    <nav className={styles.nav} aria-label="Page navigation">
      {Array.from({ length: totalScreens }, (_, i) => (
        <button
          key={i}
          className={styles.dot}
          data-active={String(i === activeIndex)}
          aria-label={`Go to screen ${i + 1}`}
          onClick={() => onDotClick?.(i)}
        />
      ))}
    </nav>
  );
});
