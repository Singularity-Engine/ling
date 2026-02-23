import { createContext, useContext, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from "@/components/ui/toaster";
import { createLogger } from '@/utils/logger';

const log = createLogger('ScreenCapture');

interface ScreenCaptureContextType {
  stream: MediaStream | null;
  isStreaming: boolean;
  error: string;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

const ScreenCaptureContext = createContext<ScreenCaptureContextType | undefined>(undefined);

export function ScreenCaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // Ref mirror — t changes identity on language switch; reading via ref keeps
  // startCapture stable so context consumers don't re-render on language change.
  const tRef = useRef(t);
  tRef.current = t;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');

  const startCapture = useCallback(async () => {
    try {
      let mediaStream: MediaStream;

      if (window.electron) {
        const sourceId = await window.electron.ipcRenderer.invoke('get-screen-capture');

        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: 1280,
              minHeight: 720,
              maxHeight: 720,
            },
          },
          audio: false,
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(displayMediaOptions);
      } else {
        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: true,
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      }

      setStream(mediaStream);
      setIsStreaming(true);
      setError('');
    } catch (err) {
      const msg = tRef.current('error.failedStartScreenCapture');
      setError(msg);
      toaster.create({
        title: `${msg}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      log.error('Failed to start capture:', err);
    }
  }, []);

  const stopCapture = useCallback(() => {
    setStream((prev) => {
      if (prev) prev.getTracks().forEach((track) => track.stop());
      return null;
    });
    setIsStreaming(false);
  }, []);

  const value = useMemo<ScreenCaptureContextType>(
    () => ({ stream, isStreaming, error, startCapture, stopCapture }),
    [stream, isStreaming, error, startCapture, stopCapture],
  );

  return (
    <ScreenCaptureContext.Provider value={value}>
      {children}
    </ScreenCaptureContext.Provider>
  );
}

export const useScreenCaptureContext = () => {
  const context = useContext(ScreenCaptureContext);
  if (context === undefined) {
    throw new Error('useScreenCaptureContext must be used within a ScreenCaptureProvider');
  }
  return context;
};
