import { createContext, useContext, useReducer, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
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
  completeTool: (id: string, result: string) => void;
  failTool: (id: string, error: string) => void;
  clearResults: () => void;
}

const ToolStateContext = createContext<ToolStateReadonly | null>(null);
const ToolActionsContext = createContext<ToolActionsType | null>(null);

// ─── Timing constants ─────────────────────────────────────────────
const PRESENTING_PHASE_MS = 3000;
const RESULT_REMOVAL_MS = 30000;

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

// ─── Reducer ──────────────────────────────────────────────────────
// All tool state transitions happen atomically inside the reducer,
// eliminating the previous anti-pattern of calling setState inside
// another setState updater (which is unsafe in Concurrent Mode).

interface ToolReducerState {
  activeTools: ToolCall[];
  recentResults: ToolCall[];
  currentPhase: 'idle' | 'thinking' | 'working' | 'presenting';
}

type ToolAction =
  | { type: 'start'; tool: ToolCall }
  | { type: 'complete'; id: string; result: string }
  | { type: 'fail'; id: string; error: string }
  | { type: 'removeRecent'; id: string }
  | { type: 'clearResults' }
  | { type: 'setPhase'; phase: ToolReducerState['currentPhase'] };

const initialToolState: ToolReducerState = {
  activeTools: [],
  recentResults: [],
  currentPhase: 'idle',
};

/** Infer phase from active tools, or null to keep the current phase. */
function inferPhase(tools: ToolCall[]): 'thinking' | 'working' | null {
  if (tools.length === 0) return null;
  if (tools.some(t => t.status === 'running')) return 'working';
  if (tools.some(t => t.status === 'pending')) return 'thinking';
  return null;
}

function toolReducer(state: ToolReducerState, action: ToolAction): ToolReducerState {
  switch (action.type) {
    case 'start': {
      const next = [...state.activeTools, action.tool];
      return { ...state, activeTools: next, currentPhase: inferPhase(next) ?? state.currentPhase };
    }
    case 'complete': {
      const tool = state.activeTools.find(t => t.id === action.id);
      if (!tool) return state;
      const completed: ToolCall = { ...tool, status: 'completed', result: action.result, endTime: Date.now() };
      const remaining = state.activeTools.filter(t => t.id !== action.id);
      return {
        activeTools: remaining,
        recentResults: [completed, ...state.recentResults].slice(0, 5),
        currentPhase: remaining.length === 0 ? 'presenting' : state.currentPhase,
      };
    }
    case 'fail': {
      const tool = state.activeTools.find(t => t.id === action.id);
      if (!tool) return state;
      const failed: ToolCall = { ...tool, status: 'error', result: action.error, endTime: Date.now() };
      const remaining = state.activeTools.filter(t => t.id !== action.id);
      return {
        activeTools: remaining,
        recentResults: [failed, ...state.recentResults].slice(0, 5),
        currentPhase: remaining.length === 0 ? 'idle' : state.currentPhase,
      };
    }
    case 'removeRecent':
      return { ...state, recentResults: state.recentResults.filter(t => t.id !== action.id) };
    case 'clearResults':
      return { ...state, recentResults: [] };
    case 'setPhase':
      return state.currentPhase === action.phase ? state : { ...state, currentPhase: action.phase };
  }
}

function computeDominant(tools: ToolCall[]): ToolCategory | null {
  if (tools.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const t of tools) {
    counts[t.category] = (counts[t.category] || 0) + 1;
  }
  let max = 0;
  let dominant: ToolCategory = 'generic';
  for (const [cat, count] of Object.entries(counts)) {
    if (count > max) { max = count; dominant = cat as ToolCategory; }
  }
  return dominant;
}

// ─── Provider ─────────────────────────────────────────────────────

export function ToolStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toolReducer, initialToolState);

  const presentingTimer = useRef<ReturnType<typeof setTimeout>>();
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const demoTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Auto-transition presenting → idle after 3s
  useEffect(() => {
    if (state.currentPhase === 'presenting') {
      presentingTimer.current = setTimeout(() => dispatch({ type: 'setPhase', phase: 'idle' }), PRESENTING_PHASE_MS);
    }
    return () => {
      if (presentingTimer.current) {
        clearTimeout(presentingTimer.current);
        presentingTimer.current = undefined;
      }
    };
  }, [state.currentPhase]);

  const scheduleRemoval = useCallback((toolId: string) => {
    const timer = setTimeout(() => {
      dispatch({ type: 'removeRecent', id: toolId });
      removalTimers.current.delete(toolId);
    }, RESULT_REMOVAL_MS);
    removalTimers.current.set(toolId, timer);
  }, []);

  const startTool = useCallback((tool: Omit<ToolCall, 'id' | 'startTime' | 'status'> & { id?: string; status?: ToolCall['status'] }) => {
    // Clear presenting timer synchronously to prevent a race where it
    // fires between dispatch and the next render.
    if (presentingTimer.current) {
      clearTimeout(presentingTimer.current);
      presentingTimer.current = undefined;
    }
    dispatch({
      type: 'start',
      tool: {
        ...tool,
        id: tool.id || `tool-${++toolIdCounter}`,
        status: tool.status || 'pending',
        startTime: Date.now(),
      },
    });
  }, []);

  const completeTool = useCallback((id: string, result: string) => {
    dispatch({ type: 'complete', id, result });
    scheduleRemoval(id);
  }, [scheduleRemoval]);

  const failTool = useCallback((id: string, error: string) => {
    dispatch({ type: 'fail', id, error });
    scheduleRemoval(id);
  }, [scheduleRemoval]);

  const clearResults = useCallback(() => {
    dispatch({ type: 'clearResults' });
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

  const dominantCategory = useMemo(() => computeDominant(state.activeTools), [state.activeTools]);
  const activeToolName = useMemo(() => state.activeTools.length > 0 ? state.activeTools[0].name : null, [state.activeTools]);

  // Demo trigger: window.__triggerToolDemo('search') in browser console (dev only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timers = demoTimers.current;
    const trackTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    window.__triggerToolDemo = (category: ToolCategory = 'search') => {
      const demoId = `tool-${++toolIdCounter}`;
      startTool({ id: demoId, name: `demo_${category}`, category, arguments: JSON.stringify({ query: 'Demo 展示' }) });
      trackTimeout(() => completeTool(demoId, JSON.stringify({ summary: `${category} 工具演示完成`, demo: true })), PRESENTING_PHASE_MS);
    };
    return () => {
      delete window.__triggerToolDemo;
      timers.forEach(id => clearTimeout(id));
      timers.clear();
    };
  }, [startTool, completeTool]);

  // Context 1: read-only state — changes on tool start/complete/fail
  const stateValue = useMemo(() => ({
    activeTools: state.activeTools,
    recentResults: state.recentResults,
    currentPhase: state.currentPhase,
    dominantCategory,
    activeToolName,
  }), [state.activeTools, state.recentResults, state.currentPhase, dominantCategory, activeToolName]);

  // Context 2: stable actions — all callbacks have stable deps, never changes
  const actionsValue = useMemo(() => ({
    startTool,
    completeTool,
    failTool,
    clearResults,
  }), [startTool, completeTool, failTool, clearResults]);

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
