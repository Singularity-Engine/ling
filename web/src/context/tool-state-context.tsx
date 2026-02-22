import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, ReactNode } from "react";
import { getSkillKey } from "../config/skill-registry";

export type ToolCategory = 'search' | 'code' | 'memory' | 'weather' | 'generic';

export interface ToolCall {
  id: string;
  name: string;
  category: ToolCategory;
  status: 'pending' | 'running' | 'completed' | 'error';
  arguments?: string;
  result?: string;
  partialResult?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Context 1 — Read-only tool state.
 * Changes when tools are started/completed/failed. Visual components
 * (BackgroundReactor, CrystalField, Constellation) subscribe here.
 */
interface ToolStateReadonly {
  activeTools: ToolCall[];
  recentResults: ToolCall[];
  currentPhase: 'idle' | 'thinking' | 'working' | 'presenting';
  dominantCategory: ToolCategory | null;
  activeToolName: string | null;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks are created with useCallback (stable deps), so this
 * context value never changes after mount. Consumers that only need
 * to WRITE tool state (e.g. websocket-handler) subscribe here without
 * incurring re-renders on every tool state change.
 */
interface ToolActionsType {
  startTool: (tool: Omit<ToolCall, 'id' | 'startTime' | 'status'> & { id?: string; status?: ToolCall['status'] }) => void;
  updateTool: (id: string, update: Partial<ToolCall>) => void;
  completeTool: (id: string, result: string) => void;
  failTool: (id: string, error: string) => void;
  clearResults: () => void;
}

const ToolStateContext = createContext<ToolStateReadonly | null>(null);
const ToolActionsContext = createContext<ToolActionsType | null>(null);

let toolIdCounter = 0;

const KEY_TO_CATEGORY: Record<string, ToolCategory> = {
  search: 'search', create: 'generic', memory: 'memory',
  writing: 'generic', weather: 'weather', places: 'generic',
  code: 'code', github: 'code', docs: 'generic',
  reason: 'generic', listen: 'generic', notion: 'generic',
};

export function categorize(toolName: string): ToolCategory {
  const key = getSkillKey(toolName);
  return KEY_TO_CATEGORY[key] || 'generic';
}

export function ToolStateProvider({ children }: { children: ReactNode }) {
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [recentResults, setRecentResults] = useState<ToolCall[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'thinking' | 'working' | 'presenting'>('idle');

  const presentingTimer = useRef<ReturnType<typeof setTimeout>>();
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const demoTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const computeDominant = useCallback((tools: ToolCall[]): ToolCategory | null => {
    if (tools.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const t of tools) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    let max = 0;
    let dominant: ToolCategory = 'generic';
    for (const [cat, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        dominant = cat as ToolCategory;
      }
    }
    return dominant;
  }, []);

  const updatePhase = useCallback((tools: ToolCall[]) => {
    if (tools.length === 0) return; // phase managed elsewhere
    const hasPending = tools.some(t => t.status === 'pending');
    const hasRunning = tools.some(t => t.status === 'running');
    if (hasRunning) {
      setCurrentPhase('working');
    } else if (hasPending) {
      setCurrentPhase('thinking');
    }
  }, []);

  const startTool = useCallback((tool: Omit<ToolCall, 'id' | 'startTime' | 'status'> & { id?: string; status?: ToolCall['status'] }) => {
    // Clear presenting timer if a new tool starts during presenting phase
    if (presentingTimer.current) {
      clearTimeout(presentingTimer.current);
      presentingTimer.current = undefined;
    }
    const newTool: ToolCall = {
      ...tool,
      id: tool.id || `tool-${++toolIdCounter}`,
      status: tool.status || 'pending',
      startTime: Date.now(),
    };
    setActiveTools(prev => {
      const next = [...prev, newTool];
      updatePhase(next);
      return next;
    });
  }, [updatePhase]);

  const updateTool = useCallback((id: string, update: Partial<ToolCall>) => {
    setActiveTools(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...update } : t);
      updatePhase(next);
      return next;
    });
  }, [updatePhase]);

  const scheduleRemoval = useCallback((toolId: string) => {
    const timer = setTimeout(() => {
      setRecentResults(prev => prev.filter(t => t.id !== toolId));
      removalTimers.current.delete(toolId);
    }, 30000);
    removalTimers.current.set(toolId, timer);
  }, []);

  const completeTool = useCallback((id: string, result: string) => {
    setActiveTools(prev => {
      const tool = prev.find(t => t.id === id);
      if (!tool) return prev;

      const completed: ToolCall = {
        ...tool,
        status: 'completed',
        result,
        endTime: Date.now(),
      };

      setRecentResults(recent => {
        const next = [completed, ...recent].slice(0, 5);
        return next;
      });
      scheduleRemoval(completed.id);

      const remaining = prev.filter(t => t.id !== id);

      if (remaining.length === 0) {
        // Enter presenting phase, then idle after 3s
        setCurrentPhase('presenting');
        if (presentingTimer.current) clearTimeout(presentingTimer.current);
        presentingTimer.current = setTimeout(() => {
          setCurrentPhase('idle');
        }, 3000);
      }

      return remaining;
    });
  }, [scheduleRemoval]);

  const failTool = useCallback((id: string, error: string) => {
    setActiveTools(prev => {
      const tool = prev.find(t => t.id === id);
      if (!tool) return prev;

      const failed: ToolCall = {
        ...tool,
        status: 'error',
        result: error,
        endTime: Date.now(),
      };

      setRecentResults(recent => {
        const next = [failed, ...recent].slice(0, 5);
        return next;
      });
      scheduleRemoval(failed.id);

      const remaining = prev.filter(t => t.id !== id);

      if (remaining.length === 0) {
        setCurrentPhase('idle');
      }

      return remaining;
    });
  }, [scheduleRemoval]);

  const clearResults = useCallback(() => {
    setRecentResults([]);
    removalTimers.current.forEach(timer => clearTimeout(timer));
    removalTimers.current.clear();
  }, []);

  // Cleanup all timers on unmount to prevent state updates after unmount
  useEffect(() => () => {
    if (presentingTimer.current) clearTimeout(presentingTimer.current);
    removalTimers.current.forEach(t => clearTimeout(t));
    removalTimers.current.clear();
    demoTimers.current.forEach(t => clearTimeout(t));
    demoTimers.current.clear();
  }, []);

  const dominantCategory = useMemo(() => computeDominant(activeTools), [computeDominant, activeTools]);
  const activeToolName = useMemo(() => activeTools.length > 0 ? activeTools[0].name : null, [activeTools]);

  // Demo trigger: window.__triggerToolDemo('search') in browser console
  useEffect(() => {
    const timers = demoTimers.current;
    const trackTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    window.__triggerToolDemo = (category: ToolCategory = 'search') => {
      startTool({ name: `demo_${category}`, category, arguments: JSON.stringify({ query: 'Demo 展示' }) });
      // The tool will auto-complete after 3s via the timeout below
      const checkAndComplete = () => {
        setActiveTools(prev => {
          const demoTool = prev.find(t => t.name === `demo_${category}` && t.status === 'pending');
          if (demoTool) {
            trackTimeout(() => completeTool(demoTool.id, JSON.stringify({ summary: `${category} 工具演示完成`, demo: true })), 3000);
          }
          return prev;
        });
      };
      // Small delay to let React state settle
      trackTimeout(checkAndComplete, 50);
    };
    return () => {
      delete window.__triggerToolDemo;
      timers.forEach(id => clearTimeout(id));
      timers.clear();
    };
  }, [startTool, completeTool]);

  // Context 1: read-only state — changes on tool start/complete/fail
  const stateValue = useMemo(() => ({
    activeTools,
    recentResults,
    currentPhase,
    dominantCategory,
    activeToolName,
  }), [activeTools, recentResults, currentPhase, dominantCategory, activeToolName]);

  // Context 2: stable actions — all callbacks have stable deps, never changes
  const actionsValue = useMemo(() => ({
    startTool,
    updateTool,
    completeTool,
    failTool,
    clearResults,
  }), [startTool, updateTool, completeTool, failTool, clearResults]);

  return (
    <ToolActionsContext.Provider value={actionsValue}>
      <ToolStateContext.Provider value={stateValue}>
        {children}
      </ToolStateContext.Provider>
    </ToolActionsContext.Provider>
  );
}

/**
 * Read-only tool state — subscribes to tool state changes.
 * Use for visual components that display tool activity.
 */
export function useToolState() {
  const ctx = useContext(ToolStateContext);
  if (!ctx) throw new Error("useToolState must be used within ToolStateProvider");
  return ctx;
}

/**
 * Stable action callbacks — never triggers re-renders.
 * Use for components that only need to dispatch tool events
 * (e.g. websocket-handler).
 */
export function useToolActions() {
  const ctx = useContext(ToolActionsContext);
  if (!ctx) throw new Error("useToolActions must be used within ToolStateProvider");
  return ctx;
}
