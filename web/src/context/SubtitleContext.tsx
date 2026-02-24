import {
  createContext, useState, useMemo, useContext, memo,
} from 'react';

/**
 * Context 1 — Read-only subtitle state.
 * Changes when subtitleText or showSubtitle update.
 */
interface SubtitleReadType {
  subtitleText: string;
  showSubtitle: boolean;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks are React state-setters (identity-stable), so this
 * context value never changes after mount. Consumers that only
 * WRITE subtitle state subscribe here without re-renders on state changes.
 */
interface SubtitleActionsType {
  setSubtitleText: (text: string) => void;
  setShowSubtitle: (show: boolean) => void;
}

/**
 * Default values and constants
 */
const DEFAULT_SUBTITLE = {
  text: "Hi, I'm some random AI VTuber. Who the hell are ya? "
        + 'Ahh, you must be amazed by my awesomeness, right? right?',
};

const SubtitleReadContext = createContext<SubtitleReadType | null>(null);
const SubtitleActionsContext = createContext<SubtitleActionsType | null>(null);

/**
 * Subtitle Provider Component
 * Manages the subtitle display text state
 */
export const SubtitleProvider = memo(({ children }: { children: React.ReactNode }) => {
  const [subtitleText, setSubtitleText] = useState<string>(DEFAULT_SUBTITLE.text);
  const [showSubtitle, setShowSubtitle] = useState<boolean>(true);

  const actions = useMemo(
    () => ({ setSubtitleText, setShowSubtitle }),
    [],
  );

  const state = useMemo(
    () => ({ subtitleText, showSubtitle }),
    [subtitleText, showSubtitle],
  );

  return (
    <SubtitleActionsContext.Provider value={actions}>
      <SubtitleReadContext.Provider value={state}>
        {children}
      </SubtitleReadContext.Provider>
    </SubtitleActionsContext.Provider>
  );
});

/** Subscribe to read-only subtitle state (re-renders on state changes). */
export function useSubtitleRead() {
  const ctx = useContext(SubtitleReadContext);
  if (!ctx) throw new Error('useSubtitleRead must be used within SubtitleProvider');
  return ctx;
}

/** Subscribe to stable subtitle actions (never causes re-renders). */
export function useSubtitleActions() {
  const ctx = useContext(SubtitleActionsContext);
  if (!ctx) throw new Error('useSubtitleActions must be used within SubtitleProvider');
  return ctx;
}

/**
 * Combined hook — returns both read-only state and actions.
 * Kept for backward compatibility with restricted files (hooks/utils/, hooks/canvas/).
 * Prefer useSubtitleRead() or useSubtitleActions() for targeted subscriptions.
 */
export function useSubtitle() {
  return { ...useSubtitleRead(), ...useSubtitleActions() };
}
