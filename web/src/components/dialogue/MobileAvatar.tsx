import { memo } from 'react';
import { LingSilhouette } from '../landing/LingSilhouette';
import styles from './MobileAvatar.module.css';

export const MobileAvatar = memo(function MobileAvatar() {
  return (
    <div className={styles.avatar}>
      <LingSilhouette visible />
    </div>
  );
});
