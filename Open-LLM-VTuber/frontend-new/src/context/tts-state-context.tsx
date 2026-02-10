import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type TTSPhase = 'idle' | 'synthesizing' | 'playing' | 'error';

interface TTSStateContextType {
  phase: TTSPhase;
  /** Number of sentences currently being synthesized */
  pendingSynth: number;
  /** Number of audio clips queued / playing */
  pendingPlay: number;
  /** Last error message (cleared on next successful synth) */
  lastError: string | null;

  markSynthStart: () => void;
  markSynthDone: () => void;
  markSynthError: (msg: string) => void;
  markPlayStart: () => void;
  markPlayDone: () => void;
  markPlayError: (msg: string) => void;
  reset: () => void;
}

const TTSStateContext = createContext<TTSStateContextType | null>(null);

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

  const value = useMemo(() => ({
    phase,
    pendingSynth,
    pendingPlay,
    lastError,
    markSynthStart,
    markSynthDone,
    markSynthError,
    markPlayStart,
    markPlayDone,
    markPlayError,
    reset,
  }), [phase, pendingSynth, pendingPlay, lastError, markSynthStart, markSynthDone, markSynthError, markPlayStart, markPlayDone, markPlayError, reset]);

  return (
    <TTSStateContext.Provider value={value}>
      {children}
    </TTSStateContext.Provider>
  );
}

export function useTTSState() {
  const ctx = useContext(TTSStateContext);
  if (!ctx) throw new Error('useTTSState must be used within TTSStateProvider');
  return ctx;
}
