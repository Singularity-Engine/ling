import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from "react";
import { useAffinityEngine } from "@/hooks/use-affinity-engine";

export interface PointGain {
  id: number;
  delta: number;
  streak: boolean;
}

/**
 * Context 1a — Affinity meta state (moderate frequency).
 * Changes when affinity value, level, or milestone updates (~1-2× per message).
 * AffinityBadge, InfoCrystal, and idle-expression hook subscribe here.
 */
interface AffinityMetaState {
  affinity: number;
  level: string;
  milestone: string | null;
}

/**
 * Context 1b — Affinity effects state (high frequency).
 * Changes on every point-gain append/remove, expression set/decay.
 * Only BackgroundReactor subscribes here.
 */
interface AffinityEffectsState {
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

const AffinityMetaContext = createContext<AffinityMetaState | null>(null);
const AffinityEffectsContext = createContext<AffinityEffectsState | null>(null);
const AffinityActionsContext = createContext<AffinityActionsType | null>(null);

export function AffinityProvider({ children }: { children: ReactNode }) {
  // Split into individual useState so React can bail out when a setter
  // receives the same primitive value, and useMemo below keeps the context
  // reference stable when unrelated fields change.
  const [affinity, setAffinityVal] = useState(50);
  const [level, setLevelVal] = useState("neutral");
  const [milestone, setMilestoneVal] = useState<string | null>(null);
  const [pointGains, setPointGains] = useState<PointGain[]>([]);
  const [currentExpression, setCurrentExpr] = useState<string | null>(null);
  const [expressionIntensity, setExprIntensity] = useState(0);

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
      pointGainTimers.current.clear();
    };
  }, []);

  const updateAffinity = useCallback((aff: number, lvl: string) => {
    setAffinityVal(aff);
    setLevelVal(lvl);
  }, []);

  const showMilestone = useCallback((message: string) => {
    if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    setMilestoneVal(message);
    milestoneTimer.current = setTimeout(() => {
      setMilestoneVal(null);
    }, 5000);
  }, []);

  const showPointGain = useCallback((delta: number, streak: boolean) => {
    const id = ++pointGainIdRef.current;
    setPointGains(prev => [...prev, { id, delta, streak }]);
    const timer = setTimeout(() => {
      pointGainTimers.current.delete(timer);
      setPointGains(prev => prev.filter(p => p.id !== id));
    }, 1500);
    pointGainTimers.current.add(timer);
  }, []);

  const setExpression = useCallback((expression: string, intensity: number) => {
    if (expressionDecayTimer.current) clearTimeout(expressionDecayTimer.current);
    currentExpressionRef.current = expression;
    setCurrentExpr(expression);
    setExprIntensity(intensity);
    // Decay expression intensity back to 0 after 8 seconds
    expressionDecayTimer.current = setTimeout(() => {
      currentExpressionRef.current = null;
      setCurrentExpr(null);
      setExprIntensity(0);
    }, 8000);
  }, []);

  const getCurrentExpression = useCallback(() => currentExpressionRef.current, []);

  // Frontend affinity engine — auto-computes affinity from chat events
  useAffinityEngine({ updateAffinity, showMilestone, showPointGain });

  const actions = useMemo(
    () => ({ updateAffinity, showMilestone, showPointGain, setExpression, getCurrentExpression }),
    [updateAffinity, showMilestone, showPointGain, setExpression, getCurrentExpression],
  );

  // Context 1a: meta — changes on affinity/level/milestone updates (moderate frequency)
  const meta = useMemo<AffinityMetaState>(
    () => ({ affinity, level, milestone }),
    [affinity, level, milestone],
  );

  // Context 1b: effects — changes on pointGains/expression updates (high frequency)
  const effects = useMemo<AffinityEffectsState>(
    () => ({ pointGains, currentExpression, expressionIntensity }),
    [pointGains, currentExpression, expressionIntensity],
  );

  return (
    <AffinityActionsContext.Provider value={actions}>
      <AffinityMetaContext.Provider value={meta}>
        <AffinityEffectsContext.Provider value={effects}>
          {children}
        </AffinityEffectsContext.Provider>
      </AffinityMetaContext.Provider>
    </AffinityActionsContext.Provider>
  );
}

/**
 * Subscribe to affinity meta state (affinity, level, milestone).
 * Re-renders only on moderate-frequency changes (~1-2× per message).
 * Prefer this over useAffinityState() when you don't need effects.
 */
export function useAffinityMeta() {
  const ctx = useContext(AffinityMetaContext);
  if (!ctx) throw new Error("useAffinityMeta must be used within AffinityProvider");
  return ctx;
}

/**
 * Subscribe to high-frequency affinity effects (pointGains, expression).
 * Only BackgroundReactor and similar visual-effects components need this.
 */
export function useAffinityEffects() {
  const ctx = useContext(AffinityEffectsContext);
  if (!ctx) throw new Error("useAffinityEffects must be used within AffinityProvider");
  return ctx;
}

/**
 * Combined hook — returns both meta and effects state.
 * Kept for backward compatibility. Prefer useAffinityMeta() or
 * useAffinityEffects() for targeted subscriptions.
 */
export function useAffinityState() {
  return { ...useAffinityMeta(), ...useAffinityEffects() };
}

/** Subscribe to stable affinity actions (never causes re-renders). */
export function useAffinityActions() {
  const ctx = useContext(AffinityActionsContext);
  if (!ctx) throw new Error("useAffinityActions must be used within AffinityProvider");
  return ctx;
}
