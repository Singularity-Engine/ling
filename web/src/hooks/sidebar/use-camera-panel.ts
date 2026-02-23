/* eslint-disable no-shadow */
import { useRef, useState } from 'react';
import { useCameraState, useCameraActions } from '@/context/camera-context';

export const useCameraPanel = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');
  const [isHovering, setIsHovering] = useState(false);
  const { isStreaming, stream } = useCameraState();
  const { startCamera, stopCamera } = useCameraActions();

  const toggleCamera = async (): Promise<void> => {
    try {
      if (isStreaming) {
        stopCamera();
      } else {
        await startCamera();
      }
      setError('');
    } catch (error) {
      let errorMessage = 'Unable to access camera';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      setError(errorMessage);
    }
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  return {
    videoRef,
    error,
    isHovering,
    isStreaming,
    stream,
    toggleCamera,
    handleMouseEnter,
    handleMouseLeave,
  };
};
