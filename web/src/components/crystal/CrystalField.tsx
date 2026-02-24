import { memo, useMemo, useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useToolState } from "../../context/ToolStateContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { InfoCrystal } from "./InfoCrystal";

const DESKTOP_POSITIONS: Record<number, CSSProperties> = {
  0: { left: "3%", top: "14%" },
  1: { right: "5%", top: "30%" },
  2: { left: "3%", top: "46%" },
  3: { right: "5%", top: "62%" },
};

// Mobile: stack on the left to avoid right-side toolbar overlap; wider margin top for safe area
const MOBILE_POSITIONS: Record<number, CSSProperties> = {
  0: { left: "3%", top: "14%" },
  1: { left: "3%", top: "36%" },
};

const EXIT_DURATION = 500; // ms — matches crystalExit keyframe

// ─── Static style constants (avoid per-render allocation during tool calls) ───

const S_FIELD: CSSProperties = {
  position: "absolute", inset: 0, pointerEvents: "none", zIndex: 23,
};

// Precompute crystal wrapper styles per position slot — eliminates
// object spreading ({ position, pointerEvents, ...positions[i] }) in
// the render path when multiple crystals are visible.
function buildWrapStyles(positions: Record<number, CSSProperties>) {
  const live: Record<number, CSSProperties> = {};
  const exit: Record<number, CSSProperties> = {};
  for (const [idx, pos] of Object.entries(positions)) {
    live[Number(idx)] = { position: "absolute", pointerEvents: "auto", ...pos };
    exit[Number(idx)] = {
      position: "absolute", pointerEvents: "none",
      animation: `crystalExit ${EXIT_DURATION}ms ease-in forwards`, ...pos,
    };
  }
  return { live, exit };
}

const DESKTOP_WRAP = buildWrapStyles(DESKTOP_POSITIONS);
const MOBILE_WRAP = buildWrapStyles(MOBILE_POSITIONS);

export const CrystalField = memo(() => {
  const { recentResults, activeTools } = useToolState();
  const isMobile = useIsMobile();

  const limit = isMobile ? 2 : 4;
  const liveCrystals = useMemo(() => {
    return [...activeTools, ...recentResults].slice(0, limit);
  }, [activeTools, recentResults, limit]);

  // Track exiting crystals so they can animate out before removal.
  // Cache + exit-detection are in a single effect to avoid ordering fragility
  // between two effects that both depend on liveCrystals.
  const prevIdsRef = useRef<Set<string>>(new Set());
  const toolCacheRef = useRef<Map<string, { tool: (typeof liveCrystals)[0]; index: number }>>(new Map());
  const [exitingMap, setExitingMap] = useState<
    Map<string, { tool: (typeof liveCrystals)[0]; index: number }>
  >(new Map());

  // Hold exit-animation timers in a ref so they survive effect re-runs.
  // Previously, `return () => clearTimeout(timer)` in the effect would cancel
  // earlier timers when liveCrystals changed rapidly, leaking exitingMap entries.
  const exitTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Cleanup all pending timers on unmount
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); };
  }, []);

  const scheduleExitCleanup = useCallback((ids: string[]) => {
    const timer = setTimeout(() => {
      exitTimersRef.current.delete(timer);
      setExitingMap(prev => {
        const next = new Map(prev);
        ids.forEach(id => next.delete(id));
        return next.size === prev.size ? prev : next;
      });
    }, EXIT_DURATION);
    exitTimersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const currentIds = new Set(liveCrystals.map(c => c.id));
    const exiting = new Map<string, { tool: (typeof liveCrystals)[0]; index: number }>();

    // Detect crystals that left — read from the *previous* cache before overwriting
    prevIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        const cached = toolCacheRef.current.get(id);
        if (cached) exiting.set(id, cached);
      }
    });

    // Update bookkeeping for next diff
    prevIdsRef.current = currentIds;
    const cache = new Map<string, { tool: (typeof liveCrystals)[0]; index: number }>();
    liveCrystals.forEach((tool, i) => cache.set(tool.id, { tool, index: i }));
    toolCacheRef.current = cache;

    if (exiting.size > 0) {
      setExitingMap(prev => new Map([...prev, ...exiting]));
      scheduleExitCleanup([...exiting.keys()]);
    }
  }, [liveCrystals, scheduleExitCleanup]);

  const wraps = isMobile ? MOBILE_WRAP : DESKTOP_WRAP;

  if (liveCrystals.length === 0 && exitingMap.size === 0) return null;

  return (
    <div style={S_FIELD}>
      {liveCrystals.map((tool, i) => (
        <div key={tool.id} style={wraps.live[i]}>
          <InfoCrystal
            tool={tool}
            position={isMobile ? "left" : i % 2 === 0 ? "left" : "right"}
            index={i}
          />
        </div>
      ))}
      {/* Exiting crystals — play exit animation then removed by timer */}
      {[...exitingMap.entries()].map(([id, { tool, index }]) => (
        <div key={`exit-${id}`} style={wraps.exit[index]}>
          <InfoCrystal
            tool={tool}
            position={isMobile ? "left" : index % 2 === 0 ? "left" : "right"}
            index={index}
          />
        </div>
      ))}
    </div>
  );
});

CrystalField.displayName = "CrystalField";
