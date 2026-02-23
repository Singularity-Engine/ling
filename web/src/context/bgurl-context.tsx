import {
  createContext, useMemo, useContext, useState, useCallback,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useWebSocket } from './websocket-context';

/**
 * Background file interface
 * @interface BackgroundFile
 */
interface BackgroundFile {
  name: string;
  url: string;
}

/**
 * Read-only background state.
 * Changes when backgroundUrl, backgroundFiles, or useCameraBackground update.
 */
interface BgUrlState {
  backgroundUrl: string;
  backgroundFiles: BackgroundFile[];
  isDefaultBackground: boolean;
  useCameraBackground: boolean;
}

/**
 * Stable action callbacks.
 * All callbacks use useCallback with stable deps, so this context value
 * never changes after mount. Consumers that only WRITE subscribe here.
 */
interface BgUrlActions {
  setBackgroundUrl: (url: string) => void;
  setBackgroundFiles: (files: BackgroundFile[]) => void;
  resetBackground: () => void;
  addBackgroundFile: (file: BackgroundFile) => void;
  removeBackgroundFile: (name: string) => void;
  setUseCameraBackground: (use: boolean) => void;
}

/**
 * Combined type — kept for backward compatibility with restricted files
 * and use-general-settings which accepts the full context as a prop.
 */
export type BgUrlContextState = BgUrlState & BgUrlActions;

const BgUrlStateContext = createContext<BgUrlState | null>(null);
const BgUrlActionsContext = createContext<BgUrlActions | null>(null);

/**
 * Background URL Provider Component
 */
export function BgUrlProvider({ children }: { children: React.ReactNode }) {
  const { baseUrl } = useWebSocket();
  const defaultBackground = useMemo(
    () => `${baseUrl}/bg/ceiling-window-room-night.jpeg`,
    [baseUrl],
  );

  const [backgroundUrl, setBackgroundUrl] = useLocalStorage<string>(
    'backgroundUrl',
    defaultBackground,
  );

  const [backgroundFiles, setBackgroundFiles] = useState<BackgroundFile[]>([]);

  const resetBackground = useCallback(() => {
    setBackgroundUrl(defaultBackground);
  }, [setBackgroundUrl, defaultBackground]);

  const addBackgroundFile = useCallback((file: BackgroundFile) => {
    setBackgroundFiles((prev) => [...prev, file]);
  }, []);

  const removeBackgroundFile = useCallback((name: string) => {
    setBackgroundFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const isDefaultBackground = useMemo(
    () => backgroundUrl === defaultBackground,
    [backgroundUrl, defaultBackground],
  );

  const [useCameraBackground, setUseCameraBackground] = useState<boolean>(false);

  const state = useMemo<BgUrlState>(() => ({
    backgroundUrl,
    backgroundFiles,
    isDefaultBackground,
    useCameraBackground,
  }), [backgroundUrl, backgroundFiles, isDefaultBackground, useCameraBackground]);

  const actions = useMemo<BgUrlActions>(() => ({
    setBackgroundUrl,
    setBackgroundFiles,
    resetBackground,
    addBackgroundFile,
    removeBackgroundFile,
    setUseCameraBackground,
  }), [setBackgroundUrl, resetBackground, addBackgroundFile, removeBackgroundFile]);

  return (
    <BgUrlActionsContext.Provider value={actions}>
      <BgUrlStateContext.Provider value={state}>
        {children}
      </BgUrlStateContext.Provider>
    </BgUrlActionsContext.Provider>
  );
}

/** Subscribe to read-only background state (re-renders on state changes). */
export function useBgUrlState() {
  const ctx = useContext(BgUrlStateContext);
  if (!ctx) throw new Error('useBgUrlState must be used within a BgUrlProvider');
  return ctx;
}

/** Subscribe to stable background actions (never causes re-renders). */
export function useBgUrlActions() {
  const ctx = useContext(BgUrlActionsContext);
  if (!ctx) throw new Error('useBgUrlActions must be used within a BgUrlProvider');
  return ctx;
}

/**
 * Combined hook — returns both state and actions.
 * Kept for backward compatibility with restricted files (hooks/canvas/).
 * Prefer useBgUrlState() or useBgUrlActions() for targeted subscriptions.
 */
export function useBgUrl() {
  return { ...useBgUrlState(), ...useBgUrlActions() };
}
