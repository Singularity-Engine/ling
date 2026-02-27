import { memo } from 'react';
import { InputBar } from '../chat/InputBar';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import styles from './SpatialInput.module.css';

export const SpatialInput = memo(function SpatialInput() {
  const { keyboardOffset } = useVisualViewport();

  return (
    <div
      className={styles.wrapper}
      style={keyboardOffset > 0 ? { transform: `translateY(-${keyboardOffset}px)` } : undefined}
    >
      <div className={styles.awakeBorder} aria-hidden="true" />
      <InputBar />
    </div>
  );
});
