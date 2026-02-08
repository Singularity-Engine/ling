import { memo, useCallback, useState } from "react";
import { useToolState, type ToolCategory } from "../../context/tool-state-context";

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: "#60a5fa",
  code: "#10b981",
  memory: "#a78bfa",
  weather: "#facc15",
  generic: "#8b5cf6",
};

const ABILITIES = [
  { key: "search" as ToolCategory, icon: "🔍", label: "搜索", prompt: "帮我搜索 " },
  { key: "code" as ToolCategory, icon: "💻", label: "代码", prompt: "帮我写代码 " },
  { key: "memory" as ToolCategory, icon: "🧠", label: "记忆", prompt: "你还记得 " },
  { key: "weather" as ToolCategory, icon: "🌤️", label: "天气", prompt: "今天天气怎么样？" },
  { key: "generic" as ToolCategory, icon: "🔧", label: "工具", prompt: "帮我 " },
] as const;

const ARC_RADIUS = 90;
const ARC_START = -60;
const ARC_STEP = 30;

export const CapabilityRing = memo(() => {
  const { dominantCategory } = useToolState();
  const [containerHovered, setContainerHovered] = useState(false);

  const handleClick = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("fill-input", { detail: { text: prompt } })
    );
  }, []);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        padding: "8px 0",
        pointerEvents: "auto",
        opacity: containerHovered ? 0.9 : 0.5,
        transition: "opacity 0.3s ease",
      }}
      onMouseEnter={() => setContainerHovered(true)}
      onMouseLeave={() => setContainerHovered(false)}
    >
      <div style={{ position: "relative", width: `${ARC_RADIUS * 2 + 40}px`, height: "56px" }}>
        {ABILITIES.map((ability, i) => {
          const angleDeg = ARC_START + i * ARC_STEP;
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = ARC_RADIUS * Math.sin(angleRad);
          const y = -ARC_RADIUS * Math.cos(angleRad) + ARC_RADIUS;
          const isActive = dominantCategory === ability.key;
          const color = CATEGORY_COLORS[ability.key];

          return (
            <AbilityButton
              key={ability.key}
              icon={ability.icon}
              label={ability.label}
              isActive={isActive}
              color={color}
              x={x}
              y={y - ARC_RADIUS}
              onClick={() => handleClick(ability.prompt)}
            />
          );
        })}
      </div>
    </div>
  );
});

CapabilityRing.displayName = "CapabilityRing";

const AbilityButton = memo(({
  icon, label, isActive, color, x, y, onClick,
}: {
  icon: string; label: string; isActive: boolean; color: string;
  x: number; y: number; onClick: () => void;
}) => {
  const [hovered, setHovered] = useState(false);

  const scale = hovered ? 1.2 : isActive ? 1.15 : 1;

  return (
    <button
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        background: "rgba(10, 0, 21, 0.6)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${(hovered || isActive) ? `${color}${hovered ? 'aa' : '88'}` : "rgba(255, 255, 255, 0.12)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.3s ease",
        transform: `translate(calc(-50% + ${x}px), calc(${y}px)) scale(${scale})`,
        boxShadow: hovered
          ? `0 0 20px ${color}44`
          : isActive
            ? `0 0 16px ${color}55, 0 0 4px ${color}33`
            : "none",
        font: "inherit",
        color: "inherit",
        padding: 0,
      }}
      onClick={onClick}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: "16px", lineHeight: 1 }}>{icon}</span>
    </button>
  );
});

AbilityButton.displayName = "AbilityButton";
