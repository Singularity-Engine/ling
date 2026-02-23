/**
 * Camera Context — dual-context split (State + Actions)
 *
 * State context: isStreaming, stream, isBackgroundStreaming,
 *   backgroundStream, cameraConfig — re-renders consumers on change.
 * Actions context: startCamera, stopCamera, startBackgroundCamera,
 *   stopBackgroundCamera, setCameraConfig, videoRef — stable after mount,
 *   never causes re-renders.
 *
 * Fixes vs. the original single-context implementation:
 * - stream/backgroundStream tracked as React state (not bare ref values
 *   snapshotted inside useMemo with wrong deps).
 * - Callbacks read cameraConfig from a ref → no longer recreated on every
 *   config change → no cascading context invalidation.
 * - Components that only need actions (e.g. use-general-settings) are
 *   shielded from streaming-state re-renders.
 *
 * useCamera() is kept for backward compatibility with restricted files
 * (hooks/utils/use-media-capture.tsx) that cannot be modified.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';
import { createLogger } from '@/utils/logger';

const log = createLogger('Camera');

interface CameraConfig {
  width: number;
  height: number;
}

// ── Context types ──────────────────────────────────────────────

interface CameraState {
  isStreaming: boolean;
  stream: MediaStream | null;
  isBackgroundStreaming: boolean;
  backgroundStream: MediaStream | null;
  cameraConfig: CameraConfig;
}

interface CameraActions {
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startBackgroundCamera: () => Promise<void>;
  stopBackgroundCamera: () => void;
  setCameraConfig: (config: CameraConfig) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  width: 320,
  height: 240,
};

const CameraStateContext = createContext<CameraState | null>(null);
const CameraActionsContext = createContext<CameraActions | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function CameraProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  // State — properly reactive, drives CameraStateContext
  const [isStreaming, setIsStreaming] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isBackgroundStreaming, setIsBackgroundStreaming] = useState(false);
  const [backgroundStream, setBackgroundStream] = useState<MediaStream | null>(null);
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(DEFAULT_CAMERA_CONFIG);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Ref mirror: callbacks read config from ref → avoids recreating
  // startCamera/startBackgroundCamera when config changes.
  const cameraConfigRef = useRef(cameraConfig);
  cameraConfigRef.current = cameraConfig;

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t('error.cameraApiNotSupported'));
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((d) => d.kind === 'videoinput')) {
        throw new Error(t('error.noCameraFound'));
      }

      const config = cameraConfigRef.current;
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: config.width }, height: { ideal: config.height } },
      });

      setStream(ms);
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
      }
      setIsStreaming(true);
    } catch (err) {
      log.error('Failed to start camera:', err);
      toaster.create({
        title: `${t('error.failedStartCamera')}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      throw err;
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    setStream((prev) => {
      if (prev) prev.getTracks().forEach((track) => track.stop());
      return null;
    });
    setIsStreaming(false);
  }, []);

  const startBackgroundCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t('error.cameraApiNotSupported'));
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((d) => d.kind === 'videoinput')) {
        throw new Error(t('error.noCameraFound'));
      }

      const config = cameraConfigRef.current;
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: config.width }, height: { ideal: config.height } },
      });

      setBackgroundStream(ms);
      setIsBackgroundStreaming(true);
    } catch (err) {
      log.error('Failed to start background camera:', err);
      toaster.create({
        title: `${t('error.failedStartBackgroundCamera')}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      throw err;
    }
  }, [t]);

  const stopBackgroundCamera = useCallback(() => {
    setBackgroundStream((prev) => {
      if (prev) prev.getTracks().forEach((track) => track.stop());
      return null;
    });
    setIsBackgroundStreaming(false);
  }, []);

  // ── Context values ──

  const stateValue = useMemo<CameraState>(
    () => ({ isStreaming, stream, isBackgroundStreaming, backgroundStream, cameraConfig }),
    [isStreaming, stream, isBackgroundStreaming, backgroundStream, cameraConfig],
  );

  const actionsValue = useMemo<CameraActions>(
    () => ({ startCamera, stopCamera, startBackgroundCamera, stopBackgroundCamera, setCameraConfig, videoRef }),
    [startCamera, stopCamera, startBackgroundCamera, stopBackgroundCamera],
  );

  return (
    <CameraActionsContext.Provider value={actionsValue}>
      <CameraStateContext.Provider value={stateValue}>
        {children}
      </CameraStateContext.Provider>
    </CameraActionsContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────

/** Subscribe to camera state (re-renders on streaming/config changes). */
export function useCameraState() {
  const ctx = useContext(CameraStateContext);
  if (!ctx) throw new Error('useCameraState must be used within CameraProvider');
  return ctx;
}

/** Subscribe to stable camera actions (never causes re-renders). */
export function useCameraActions() {
  const ctx = useContext(CameraActionsContext);
  if (!ctx) throw new Error('useCameraActions must be used within CameraProvider');
  return ctx;
}

/**
 * Legacy combined hook — kept for backward compatibility with restricted
 * files (hooks/utils/*) that cannot be modified.
 * Prefer useCameraState() / useCameraActions() in new code.
 */
export function useCamera() {
  const state = useContext(CameraStateContext);
  const actions = useContext(CameraActionsContext);
  if (!state || !actions) throw new Error('useCamera must be used within CameraProvider');
  return { ...state, ...actions };
}
