import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

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

interface ToolStateContextType {
  activeTools: ToolCall[];
  recentResults: ToolCall[];
  currentPhase: 'idle' | 'thinking' | 'working' | 'presenting';
  dominantCategory: ToolCategory | null;

  startTool: (tool: Omit<ToolCall, 'id' | 'startTime' | 'status'>) => void;
  updateTool: (id: string, update: Partial<ToolCall>) => void;
  completeTool: (id: string, result: string) => void;
  failTool: (id: string, error: string) => void;
  clearResults: () => void;
}

const ToolStateContext = createContext<ToolStateContextType | null>(null);

let toolIdCounter = 0;

export function categorize(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();
  if (/search|brave|web|google/.test(name)) return 'search';
  if (/weather/.test(name)) return 'weather';
  if (/memory|remember|recall|evermem/.test(name)) return 'memory';
  if (/code|exec|run|python|node/.test(name)) return 'code';
  return 'generic';
}

export function ToolStateProvider({ children }: { children: ReactNode }) {
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [recentResults, setRecentResults] = useState<ToolCall[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'thinking' | 'working' | 'presenting'>('idle');

  const presentingTimer = useRef<ReturnType<typeof setTimeout>>();
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const startTool = useCallback((tool: Omit<ToolCall, 'id' | 'startTime' | 'status'>) => {
    const newTool: ToolCall = {
      ...tool,
      id: `tool-${++toolIdCounter}`,
      status: 'pending',
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

  const dominantCategory = computeDominant(activeTools);

  return (
    <ToolStateContext.Provider value={{
      activeTools,
      recentResults,
      currentPhase,
      dominantCategory,
      startTool,
      updateTool,
      completeTool,
      failTool,
      clearResults,
    }}>
      {children}
    </ToolStateContext.Provider>
  );
}

export function useToolState() {
  const ctx = useContext(ToolStateContext);
  if (!ctx) throw new Error("useToolState must be used within ToolStateProvider");
  return ctx;
}
