import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { canvasStyles } from './canvas-styles';
import { useCamera } from '@/context/camera-context';
import { useBgUrl } from '@/context/bgurl-context';

const Background = memo(({ children }: { children?: React.ReactNode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    backgroundStream, isBackgroundStreaming, startBackgroundCamera, stopBackgroundCamera,
  } = useCamera();
  const { useCameraBackground, backgroundUrl } = useBgUrl();
  const [bgLoaded, setBgLoaded] = useState(false);

  const handleBgLoad = useCallback(() => setBgLoaded(true), []);

  // Reset loaded state when URL changes
  useEffect(() => { setBgLoaded(false); }, [backgroundUrl]);

  useEffect(() => {
    if (useCameraBackground) {
      startBackgroundCamera();
    } else {
      stopBackgroundCamera();
    }
  }, [useCameraBackground, startBackgroundCamera, stopBackgroundCamera]);

  useEffect(() => {
    if (videoRef.current && backgroundStream) {
      videoRef.current.srcObject = backgroundStream;
    }
  }, [backgroundStream]);

  return (
    <div style={canvasStyles.background.container}>
      {useCameraBackground ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            ...canvasStyles.background.video,
            display: isBackgroundStreaming ? 'block' : 'none',
            transform: 'scaleX(-1)',
          }}
        />
      ) : (
        <img
          style={{
            ...canvasStyles.background.image,
            opacity: bgLoaded ? 1 : 0,
            transition: 'opacity 0.4s ease-in',
          }}
          src={backgroundUrl}
          alt="background"
          decoding="async"
          onLoad={handleBgLoad}
        />
      )}
      {children}
    </div>
  );
});

Background.displayName = 'Background';

export default Background;
