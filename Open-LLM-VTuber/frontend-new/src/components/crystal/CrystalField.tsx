import { memo, useMemo } from "react";
import { useToolState } from "../../context/tool-state-context";
import { InfoCrystal } from "./InfoCrystal";

const POSITIONS: Record<number, React.CSSProperties> = {
  0: { left: "3%", top: "15%" },
  1: { right: "3%", top: "22%" },
  2: { left: "3%", top: "42%" },
  3: { right: "3%", top: "49%" },
};

export const CrystalField = memo(() => {
  const { recentResults, activeTools } = useToolState();

  const crystals = useMemo(() => {
    return [...activeTools, ...recentResults].slice(0, 4);
  }, [activeTools, recentResults]);

  if (crystals.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}>
      {crystals.map((tool, i) => (
        <div
          key={tool.id}
          style={{
            position: "absolute",
            pointerEvents: "auto",
            ...POSITIONS[i],
          }}
        >
          <InfoCrystal
            tool={tool}
            position={i % 2 === 0 ? "left" : "right"}
            index={i}
          />
        </div>
      ))}
    </div>
  );
});

CrystalField.displayName = "CrystalField";
