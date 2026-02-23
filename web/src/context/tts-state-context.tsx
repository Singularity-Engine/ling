import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type TTSPhase = 'idle' | 'synthesizing' | 'playing' | 'error';

/**
 * Context 1 — Read-only TTS state.
 * Changes when synth/play counters or error state update.
 */
interface TTSState {
  phase: TTSPhase;
  /** Number of sentences currently being synthesized */
  pendingSynth: number;
  /** Number of audio clips queued / playing */
  pendingPlay: number;
  /** Last error message (cleared on next successful synth) */
  lastError: string | null;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks are created with useCallback (empty deps), so this
 * context value never changes after mount. Consumers that only need
 * to WRITE TTS state (e.g. websocket-handler) subscribe here
 * without incurring re-renders on every state change.
 */
interface TTSActionsType {
  markSynthStart: () => void;
  markSynthDone: () => void;
  markSynthError: (msg: string) => void;
  markPlayStart: () => void;
  markPlayDone: () => void;
  markPlayError: (msg: string) => void;
  reset: () => void;
}

const TTSStateContext = createContext<TTSState | null>(null);
const TTSActionsContext = createContext<TTSActionsType | null>(null);

export function TTSStateProvider({ children }: { children: ReactNode }) {
  const [pendingSynth, setPendingSynth] = useState(0);
  const [pendingPlay, setPendingPlay] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const markSynthStart = useCallback(() => {
    setPendingSynth(n => n + 1);
    setLastError(null);
  }, []);

  const markSynthDone = useCallback(() => {
    setPendingSynth(n => Math.max(0, n - 1));
  }, []);

  const markSynthError = useCallback((msg: string) => {
    setPendingSynth(n => Math.max(0, n - 1));
    setLastError(msg);
  }, []);

  const markPlayStart = useCallback(() => {
    setPendingPlay(n => n + 1);
  }, []);

  const markPlayDone = useCallback(() => {
    setPendingPlay(n => Math.max(0, n - 1));
  }, []);

  const markPlayError = useCallback((msg: string) => {
    setPendingPlay(n => Math.max(0, n - 1));
    setLastError(msg);
  }, []);

  const reset = useCallback(() => {
    setPendingSynth(0);
    setPendingPlay(0);
    setLastError(null);
  }, []);

  const phase: TTSPhase = useMemo(() => {
    if (lastError && pendingSynth === 0 && pendingPlay === 0) return 'error';
    if (pendingSynth > 0) return 'synthesizing';
    if (pendingPlay > 0) return 'playing';
    return 'idle';
  }, [pendingSynth, pendingPlay, lastError]);

  const actions = useMemo(
    () => ({ markSynthStart, markSynthDone, markSynthError, markPlayStart, markPlayDone, markPlayError, reset }),
    [markSynthStart, markSynthDone, markSynthError, markPlayStart, markPlayDone, markPlayError, reset],
  );

  const state = useMemo(
    () => ({ phase, pendingSynth, pendingPlay, lastError }),
    [phase, pendingSynth, pendingPlay, lastError],
  );

  return (
    <TTSActionsContext.Provider value={actions}>
      <TTSStateContext.Provider value={state}>
        {children}
      </TTSStateContext.Provider>
    </TTSActionsContext.Provider>
  );
}

/** Subscribe to read-only TTS state (re-renders on state changes). */
export function useTTSState() {
  const ctx = useContext(TTSStateContext);
  if (!ctx) throw new Error('useTTSState must be used within TTSStateProvider');
  return ctx;
}

/** Subscribe to stable TTS actions (never causes re-renders). */
export function useTTSActions() {
  const ctx = useContext(TTSActionsContext);
  if (!ctx) throw new Error('useTTSActions must be used within TTSStateProvider');
  return ctx;
}
