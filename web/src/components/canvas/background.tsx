import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { canvasStyles } from './canvas-styles';
import { useCameraState, useCameraActions } from '@/context/camera-context';
import { useBgUrlState } from '@/context/bgurl-context';

const Background = memo(({ children }: { children?: React.ReactNode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { backgroundStream, isBackgroundStreaming } = useCameraState();
  const { startBackgroundCamera, stopBackgroundCamera } = useCameraActions();
  const { useCameraBackground, backgroundUrl } = useBgUrlState();
  const [bgLoaded, setBgLoaded] = useState(false);

  const handleBgLoad = useCallback(() => setBgLoaded(true), []);

  const videoStyle = useMemo(() => ({
    ...canvasStyles.background.video,
    display: isBackgroundStreaming ? 'block' as const : 'none' as const,
    transform: 'scaleX(-1)',
  }), [isBackgroundStreaming]);

  const imgStyle = useMemo(() => ({
    ...canvasStyles.background.image,
    opacity: bgLoaded ? 1 : 0,
    transition: 'opacity 0.4s ease-in',
  }), [bgLoaded]);

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
          style={videoStyle}
        />
      ) : (
        <img
          style={imgStyle}
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
