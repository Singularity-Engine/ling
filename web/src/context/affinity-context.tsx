import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { useAffinityEngine } from "@/hooks/use-affinity-engine";

export interface PointGain {
  id: number;
  delta: number;
  streak: boolean;
}

interface AffinityState {
  affinity: number;
  level: string;
  milestone: string | null;
  pointGains: PointGain[];
  currentExpression: string | null;
  expressionIntensity: number;
}

interface AffinityContextType extends AffinityState {
  updateAffinity: (affinity: number, level: string) => void;
  showMilestone: (message: string) => void;
  showPointGain: (delta: number, streak: boolean) => void;
  setExpression: (expression: string, intensity: number) => void;
}

const AffinityContext = createContext<AffinityContextType | null>(null);

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
  const pointGainIdRef = useRef(0);

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
    setTimeout(() => {
      setState(prev => ({ ...prev, pointGains: prev.pointGains.filter(p => p.id !== id) }));
    }, 1500);
  }, []);

  const setExpression = useCallback((expression: string, intensity: number) => {
    setState(prev => ({ ...prev, currentExpression: expression, expressionIntensity: intensity }));
  }, []);

  // Frontend affinity engine — auto-computes affinity from chat events
  useAffinityEngine({ updateAffinity, showMilestone, showPointGain });

  return (
    <AffinityContext.Provider value={{ ...state, updateAffinity, showMilestone, showPointGain, setExpression }}>
      {children}
    </AffinityContext.Provider>
  );
}

export function useAffinity() {
  const ctx = useContext(AffinityContext);
  if (!ctx) throw new Error("useAffinity must be used within AffinityProvider");
  return ctx;
}
