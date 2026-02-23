import {
  createContext,
  useState,
  ReactNode,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

/**
 * Enum for all possible AI states
 * @description Defines all possible states that the AI can be in
 */
// eslint-disable-next-line no-shadow
export const enum AiStateEnum {
  /**
   * - Can be triggered to speak proactively
   * - Ready to receive user input
   */
  IDLE = 'idle',

  /**
   * - Can be interrupted by user
   */
  THINKING_SPEAKING = 'thinking-speaking',

  /**
   * - Triggered by sending text / detecting speech / clicking interrupt button / creating new chat history / switching character
   */
  INTERRUPTED = 'interrupted',

  /**
   * - Shows during initial load / character switching
   */
  LOADING = 'loading',

  /**
   * - Speech is detected
   */
  LISTENING = 'listening',

  /**
   * - Set when user is typing
   * - Auto returns to IDLE after 2s
   */
  WAITING = 'waiting',
}

export type AiState = `${AiStateEnum}`;

/**
 * Context 1 — Read-only AI state.
 * Changes when aiState or backendSynthComplete update.
 */
interface AiStateReadType {
  aiState: AiState;
  backendSynthComplete: boolean;
  isIdle: boolean;
  isThinkingSpeaking: boolean;
  isInterrupted: boolean;
  isLoading: boolean;
  isListening: boolean;
  isWaiting: boolean;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks use useCallback with empty/stable deps, so this
 * context value never changes after mount. Consumers that only
 * WRITE AI state subscribe here without re-renders on state changes.
 */
interface AiStateActionsType {
  setAiState: {
    (state: AiState): void;
    (updater: (currentState: AiState) => AiState): void;
  };
  setBackendSynthComplete: (complete: boolean) => void;
  resetState: () => void;
}

const AiStateReadContext = createContext<AiStateReadType | null>(null);
const AiStateActionsContext = createContext<AiStateActionsType | null>(null);

/**
 * Initial context value
 */
const initialState: AiState = AiStateEnum.LOADING;

/**
 * AI State Provider Component
 */
export function AiStateProvider({ children }: { children: ReactNode }) {
  const [aiState, setAiStateInternal] = useState<AiState>(initialState);
  const [backendSynthComplete, setBackendSynthComplete] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const setAiState = useCallback((newState: AiState | ((currentState: AiState) => AiState)) => {
    setAiStateInternal((currentState) => {
      const nextState = typeof newState === 'function'
        ? (newState as (currentState: AiState) => AiState)(currentState)
        : newState;

      if (nextState === AiStateEnum.WAITING) {
        if (currentState === AiStateEnum.THINKING_SPEAKING) {
          return currentState; // suppress WAITING during active response
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setAiStateInternal(AiStateEnum.IDLE);
          timerRef.current = null;
        }, 2000);
        return nextState;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return nextState;
    });
  }, []);

  const resetState = useCallback(() => {
    setAiState(AiStateEnum.IDLE);
  }, [setAiState]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  const actions = useMemo(
    () => ({ setAiState, setBackendSynthComplete, resetState }),
    [setAiState, setBackendSynthComplete, resetState],
  );

  const state = useMemo(
    () => ({
      aiState,
      backendSynthComplete,
      isIdle: aiState === AiStateEnum.IDLE,
      isThinkingSpeaking: aiState === AiStateEnum.THINKING_SPEAKING,
      isInterrupted: aiState === AiStateEnum.INTERRUPTED,
      isLoading: aiState === AiStateEnum.LOADING,
      isListening: aiState === AiStateEnum.LISTENING,
      isWaiting: aiState === AiStateEnum.WAITING,
    }),
    [aiState, backendSynthComplete],
  );

  return (
    <AiStateActionsContext.Provider value={actions}>
      <AiStateReadContext.Provider value={state}>
        {children}
      </AiStateReadContext.Provider>
    </AiStateActionsContext.Provider>
  );
}

/** Subscribe to read-only AI state (re-renders on state changes). */
export function useAiStateRead() {
  const ctx = useContext(AiStateReadContext);
  if (!ctx) throw new Error('useAiStateRead must be used within AiStateProvider');
  return ctx;
}

/** Subscribe to stable AI state actions (never causes re-renders). */
export function useAiStateActions() {
  const ctx = useContext(AiStateActionsContext);
  if (!ctx) throw new Error('useAiStateActions must be used within AiStateProvider');
  return ctx;
}

/**
 * Combined hook — returns both read-only state and actions.
 * Kept for backward compatibility with restricted files (hooks/utils/, components/canvas/).
 * Prefer useAiStateRead() or useAiStateActions() for targeted subscriptions.
 */
export function useAiState() {
  return { ...useAiStateRead(), ...useAiStateActions() };
}
