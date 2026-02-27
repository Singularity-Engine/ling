import { memo, useState, useCallback } from 'react';
import { BreathingBackground } from '../shared/BreathingBackground';
import { Live2D } from '../canvas/live2d';
import { DialogueSpace } from './DialogueSpace';
import { SpatialInput } from './SpatialInput';
import { BrandEntrance } from './BrandEntrance';
import { VitalsBar } from '../vitals/VitalsBar';
import { MobileAvatar } from './MobileAvatar';
import { useVitalsData } from '@/hooks/useVitalsData';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import styles from './SpatialLayout.module.css';

export const SpatialLayout = memo(function SpatialLayout() {
  const vitals = useVitalsData();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [brandDone, setBrandDone] = useState(false);
  const handleBrandComplete = useCallback(() => setBrandDone(true), []);

  return (
    <div className={styles.root}>
      <BreathingBackground />

      {!brandDone && <BrandEntrance onComplete={handleBrandComplete} />}

      <header className={styles.vitals}>
        <VitalsBar vitals={vitals} />
      </header>

      <div className={styles.stage}>
        {!isMobile && (
          <div className={styles.character}>
            <Live2D />
          </div>
        )}

        <main className={styles.dialogue}>
          {isMobile && (
            <div className={styles.mobileHeader}>
              <MobileAvatar />
              <span className={styles.statusDot} aria-label="Online" />
            </div>
          )}
          <DialogueSpace />
          <SpatialInput />
        </main>
      </div>
    </div>
  );
});
