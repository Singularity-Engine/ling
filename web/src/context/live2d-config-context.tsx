import {
  createContext, useContext, useState, useMemo, useCallback,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { createLogger } from '@/utils/logger';

const log = createLogger('Live2DConfig');

/**
 * Model emotion mapping interface
 * @interface EmotionMap
 */
interface EmotionMap {
  [key: string]: number | string;
}

/**
 * Motion weight mapping interface
 * @interface MotionWeightMap
 */
export interface MotionWeightMap {
  [key: string]: number;
}

/**
 * Tap motion mapping interface
 * @interface TapMotionMap
 */
export interface TapMotionMap {
  [key: string]: MotionWeightMap;
}

/**
 * Live2D model information interface
 * @interface ModelInfo
 */
export interface ModelInfo {
  /** Model name */
  name?: string;

  /** Model description */
  description?: string;

  /** Model URL */
  url: string;

  /** Scale factor */
  kScale: number;

  /** Initial X position shift */
  initialXshift: number;

  /** Initial Y position shift */
  initialYshift: number;

  /** Idle motion group name */
  idleMotionGroupName?: string;

  /** Default emotion */
  defaultEmotion?: number | string;

  /** Emotion mapping configuration */
  emotionMap: EmotionMap;

  /** Enable pointer interactivity */
  pointerInteractive?: boolean;

  /** Tap motion mapping configuration */
  tapMotions?: TapMotionMap;

  /** Enable scroll to resize */
  scrollToResize?: boolean;

  /** Initial scale */
  initialScale?: number;
}

/**
 * Context 1 — Read-only Live2D config state.
 * Changes when modelInfo or isLoading update.
 */
interface Live2DConfigReadType {
  modelInfo?: ModelInfo;
  isLoading: boolean;
}

/**
 * Context 2 — Stable action callbacks.
 * setIsLoading is a React state-setter (identity-stable) and setModelInfo
 * is wrapped in useCallback with stable deps, so this context value never
 * changes after mount. Consumers that only WRITE subscribe here without
 * re-renders on state changes.
 */
interface Live2DConfigActionsType {
  setModelInfo: (info: ModelInfo | undefined) => void;
  setIsLoading: (loading: boolean) => void;
}

const DEFAULT_CONFIG = {
  modelInfo: {
    scrollToResize: true,
  } as ModelInfo | undefined,
  isLoading: false,
};

const Live2DConfigReadContext = createContext<Live2DConfigReadType | null>(null);
const Live2DConfigActionsContext = createContext<Live2DConfigActionsType | null>(null);

/**
 * Live2D Configuration Provider Component
 */
export function Live2DConfigProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(DEFAULT_CONFIG.isLoading);

  const [modelInfo, setModelInfoState] = useLocalStorage<ModelInfo | undefined>(
    "modelInfo",
    DEFAULT_CONFIG.modelInfo,
    {
      filter: (value) => (value ? { ...value, url: "" } : value),
    },
  );

  const setModelInfo = useCallback((info: ModelInfo | undefined) => {
    if (!info?.url) {
      setModelInfoState(undefined);
      return;
    }

    // Always use the scale defined in the incoming info object (from config)
    const finalScale = Number(info.kScale || 0.5) * 2;
    log.debug('Setting model info with default scale:', finalScale);

    // Use functional updater to read prev state — avoids stale closure over modelInfo
    setModelInfoState((prev) => ({
      ...info,
      kScale: finalScale,
      pointerInteractive:
        "pointerInteractive" in info
          ? info.pointerInteractive
          : (prev?.pointerInteractive ?? true),
      scrollToResize:
        "scrollToResize" in info
          ? info.scrollToResize
          : (prev?.scrollToResize ?? true),
    }));
  }, [setModelInfoState]);

  const actions = useMemo(
    () => ({ setModelInfo, setIsLoading }),
    [setModelInfo],
  );

  const state = useMemo(
    () => ({ modelInfo, isLoading }),
    [modelInfo, isLoading],
  );

  return (
    <Live2DConfigActionsContext.Provider value={actions}>
      <Live2DConfigReadContext.Provider value={state}>
        {children}
      </Live2DConfigReadContext.Provider>
    </Live2DConfigActionsContext.Provider>
  );
}

/** Subscribe to read-only Live2D config state (re-renders on state changes). */
export function useLive2DConfigRead() {
  const ctx = useContext(Live2DConfigReadContext);
  if (!ctx) throw new Error('useLive2DConfigRead must be used within Live2DConfigProvider');
  return ctx;
}

/** Subscribe to stable Live2D config actions (never causes re-renders). */
export function useLive2DConfigActions() {
  const ctx = useContext(Live2DConfigActionsContext);
  if (!ctx) throw new Error('useLive2DConfigActions must be used within Live2DConfigProvider');
  return ctx;
}

/**
 * Combined hook — returns both read-only state and actions.
 * Kept for backward compatibility with restricted files (hooks/utils/, components/canvas/).
 * Prefer useLive2DConfigRead() or useLive2DConfigActions() for targeted subscriptions.
 */
export function useLive2DConfig() {
  return { ...useLive2DConfigRead(), ...useLive2DConfigActions() };
}

export default Live2DConfigProvider;
