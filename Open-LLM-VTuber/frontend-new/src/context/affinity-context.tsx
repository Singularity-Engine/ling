import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

interface AffinityState {
  affinity: number;
  level: string;
  milestone: string | null;
  currentExpression: string | null;
  expressionIntensity: number;
}

interface AffinityContextType extends AffinityState {
  updateAffinity: (affinity: number, level: string) => void;
  showMilestone: (message: string) => void;
  setExpression: (expression: string, intensity: number) => void;
}

const AffinityContext = createContext<AffinityContextType | null>(null);

export function AffinityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AffinityState>({
    affinity: 50,
    level: "neutral",
    milestone: null,
    currentExpression: null,
    expressionIntensity: 0,
  });
  const milestoneTimer = useRef<ReturnType<typeof setTimeout>>();

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

  const setExpression = useCallback((expression: string, intensity: number) => {
    setState(prev => ({ ...prev, currentExpression: expression, expressionIntensity: intensity }));
  }, []);

  return (
    <AffinityContext.Provider value={{ ...state, updateAffinity, showMilestone, setExpression }}>
      {children}
    </AffinityContext.Provider>
  );
}

export function useAffinity() {
  const ctx = useContext(AffinityContext);
  if (!ctx) throw new Error("useAffinity must be used within AffinityProvider");
  return ctx;
}
