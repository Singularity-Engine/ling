import { memo, useMemo, useState, useEffect } from "react";
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

export const CrystalField = memo(() => {
  const { recentResults, activeTools } = useToolState();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const crystals = useMemo(() => {
    return [...activeTools, ...recentResults].slice(0, isMobile ? 2 : 4);
  }, [activeTools, recentResults, isMobile]);

  const positions = isMobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;

  if (crystals.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}>
      {crystals.map((tool, i) => (
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
    </div>
  );
});

CrystalField.displayName = "CrystalField";
