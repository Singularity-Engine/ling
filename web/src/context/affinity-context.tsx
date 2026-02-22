import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, ReactNode } from "react";
import { useAffinityEngine } from "@/hooks/use-affinity-engine";

export interface PointGain {
  id: number;
  delta: number;
  streak: boolean;
}

/**
 * Context 1 — Read-only affinity state.
 * Changes when affinity values, milestones, point gains, or expressions update.
 * Visual components (BackgroundReactor, AffinityBadge, InfoCrystal) subscribe here.
 */
interface AffinityState {
  affinity: number;
  level: string;
  milestone: string | null;
  pointGains: PointGain[];
  currentExpression: string | null;
  expressionIntensity: number;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks are created with useCallback (stable deps), so this
 * context value never changes after mount. Consumers that only need
 * to WRITE affinity state (e.g. websocket-handler) subscribe here
 * without incurring re-renders on every state change.
 */
interface AffinityActionsType {
  updateAffinity: (affinity: number, level: string) => void;
  showMilestone: (message: string) => void;
  showPointGain: (delta: number, streak: boolean) => void;
  setExpression: (expression: string, intensity: number) => void;
  /** Read current expression from a ref — avoids subscribing to state context. */
  getCurrentExpression: () => string | null;
}

const AffinityStateContext = createContext<AffinityState | null>(null);
const AffinityActionsContext = createContext<AffinityActionsType | null>(null);

export function AffinityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AffinityState>({
    affinity: 50,
    level: "neutral",
    milestone: null,
    pointGains: [],
    currentExpression: null,
    expressionIntensity: 0,
  });
  const milestoneTimer = useRef<ReturnType<typeof setTimeout>>();
  const expressionDecayTimer = useRef<ReturnType<typeof setTimeout>>();
  const pointGainIdRef = useRef(0);
  const pointGainTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const currentExpressionRef = useRef<string | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      if (expressionDecayTimer.current) clearTimeout(expressionDecayTimer.current);
      pointGainTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const updateAffinity = useCallback((affinity: number, level: string) => {
    setState(prev => ({ ...prev, affinity, level }));
  }, []);

  const showMilestone = useCallback((message: string) => {
    if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    setState(prev => ({ ...prev, milestone: message }));
    milestoneTimer.current = setTimeout(() => {
      setState(prev => ({ ...prev, milestone: null }));
    }, 5000);
  }, []);

  const showPointGain = useCallback((delta: number, streak: boolean) => {
    const id = ++pointGainIdRef.current;
    setState(prev => ({ ...prev, pointGains: [...prev.pointGains, { id, delta, streak }] }));
    const timer = setTimeout(() => {
      pointGainTimers.current.delete(timer);
      setState(prev => ({ ...prev, pointGains: prev.pointGains.filter(p => p.id !== id) }));
    }, 1500);
    pointGainTimers.current.add(timer);
  }, []);

  const setExpression = useCallback((expression: string, intensity: number) => {
    if (expressionDecayTimer.current) clearTimeout(expressionDecayTimer.current);
    currentExpressionRef.current = expression;
    setState(prev => ({ ...prev, currentExpression: expression, expressionIntensity: intensity }));
    // Decay expression intensity back to 0 after 8 seconds
    expressionDecayTimer.current = setTimeout(() => {
      currentExpressionRef.current = null;
      setState(prev => ({ ...prev, currentExpression: null, expressionIntensity: 0 }));
    }, 8000);
  }, []);

  const getCurrentExpression = useCallback(() => currentExpressionRef.current, []);

  // Frontend affinity engine — auto-computes affinity from chat events
  useAffinityEngine({ updateAffinity, showMilestone, showPointGain });

  const actions = useMemo(
    () => ({ updateAffinity, showMilestone, showPointGain, setExpression, getCurrentExpression }),
    [updateAffinity, showMilestone, showPointGain, setExpression, getCurrentExpression],
  );

  return (
    <AffinityActionsContext.Provider value={actions}>
      <AffinityStateContext.Provider value={state}>
        {children}
      </AffinityStateContext.Provider>
    </AffinityActionsContext.Provider>
  );
}

/** Subscribe to read-only affinity state (re-renders on state changes). */
export function useAffinityState() {
  const ctx = useContext(AffinityStateContext);
  if (!ctx) throw new Error("useAffinityState must be used within AffinityProvider");
  return ctx;
}

/** Subscribe to stable affinity actions (never causes re-renders). */
export function useAffinityActions() {
  const ctx = useContext(AffinityActionsContext);
  if (!ctx) throw new Error("useAffinityActions must be used within AffinityProvider");
  return ctx;
}
