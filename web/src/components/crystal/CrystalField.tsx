import { memo, useMemo, useState, useEffect, useRef } from "react";
import { useToolState } from "../../context/tool-state-context";
import { InfoCrystal } from "./InfoCrystal";

const DESKTOP_POSITIONS: Record<number, React.CSSProperties> = {
  0: { left: "3%", top: "14%" },
  1: { right: "5%", top: "30%" },
  2: { left: "3%", top: "46%" },
  3: { right: "5%", top: "62%" },
};

// Mobile: stack all on the left to avoid right-side toolbar overlap
const MOBILE_POSITIONS: Record<number, React.CSSProperties> = {
  0: { left: "3%", top: "12%" },
  1: { left: "3%", top: "32%" },
  2: { left: "3%", top: "52%" },
  3: { left: "3%", top: "72%" },
};

const EXIT_DURATION = 500; // ms — matches crystalExit keyframe

export const CrystalField = memo(() => {
  const { recentResults, activeTools } = useToolState();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const limit = isMobile ? 2 : 4;
  const liveCrystals = useMemo(() => {
    return [...activeTools, ...recentResults].slice(0, limit);
  }, [activeTools, recentResults, limit]);

  // Track exiting crystals so they can animate out before removal
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [exitingMap, setExitingMap] = useState<
    Map<string, { tool: (typeof liveCrystals)[0]; index: number }>
  >(new Map());

  useEffect(() => {
    const currentIds = new Set(liveCrystals.map(c => c.id));
    const exiting = new Map<string, { tool: (typeof liveCrystals)[0]; index: number }>();

    // Find crystals that were visible but are no longer in the live list
    prevIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        // Look up the tool data from the previous render's exiting map or nowhere
        // We stored it in the ref below
        const cached = toolCacheRef.current.get(id);
        if (cached) {
          exiting.set(id, cached);
        }
      }
    });

    prevIdsRef.current = currentIds;

    if (exiting.size > 0) {
      setExitingMap(prev => new Map([...prev, ...exiting]));
      // Remove exiting entries after animation completes
      const timer = setTimeout(() => {
        setExitingMap(prev => {
          const next = new Map(prev);
          exiting.forEach((_, id) => next.delete(id));
          return next;
        });
      }, EXIT_DURATION);
      return () => clearTimeout(timer);
    }
  }, [liveCrystals]);

  // Cache tool data + position index for exit animation
  const toolCacheRef = useRef<Map<string, { tool: (typeof liveCrystals)[0]; index: number }>>(new Map());
  useEffect(() => {
    const cache = new Map<string, { tool: (typeof liveCrystals)[0]; index: number }>();
    liveCrystals.forEach((tool, i) => cache.set(tool.id, { tool, index: i }));
    toolCacheRef.current = cache;
  }, [liveCrystals]);

  const positions = isMobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;

  if (liveCrystals.length === 0 && exitingMap.size === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}>
      {liveCrystals.map((tool, i) => (
        <div
          key={tool.id}
          style={{
            position: "absolute",
            pointerEvents: "auto",
            ...positions[i],
          }}
        >
          <InfoCrystal
            tool={tool}
            position={isMobile ? "left" : i % 2 === 0 ? "left" : "right"}
            index={i}
          />
        </div>
      ))}
      {/* Exiting crystals — play exit animation then removed by timer */}
      {[...exitingMap.entries()].map(([id, { tool, index }]) => (
        <div
          key={`exit-${id}`}
          style={{
            position: "absolute",
            pointerEvents: "none",
            animation: `crystalExit ${EXIT_DURATION}ms ease-in forwards`,
            ...positions[index],
          }}
        >
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
