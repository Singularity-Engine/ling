import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useToolState, type ToolCategory } from "../../context/tool-state-context";

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: "#60a5fa",
  code: "#10b981",
  memory: "#a78bfa",
  weather: "#facc15",
  generic: "#8b5cf6",
};

const ABILITIES = [
  { key: "search" as ToolCategory, icon: "🔍", labelKey: "capability.search", promptKey: "capability.searchPrompt" },
  { key: "code" as ToolCategory, icon: "💻", labelKey: "capability.code", promptKey: "capability.codePrompt" },
  { key: "memory" as ToolCategory, icon: "🧠", labelKey: "capability.memory", promptKey: "capability.memoryPrompt" },
  { key: "weather" as ToolCategory, icon: "🌤️", labelKey: "capability.weather", promptKey: "capability.weatherPrompt" },
  { key: "generic" as ToolCategory, icon: "🔧", labelKey: "capability.tool", promptKey: "capability.genericPrompt" },
] as const;

const ARC_RADIUS = 90;
const ARC_START = -60;
const ARC_STEP = 30;

// Inject keyframes once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes capRingPulse {
      0%, 100% { box-shadow: 0 0 8px var(--pulse-color, #8b5cf655), 0 0 2px var(--pulse-color, #8b5cf633); }
      50% { box-shadow: 0 0 20px var(--pulse-color, #8b5cf688), 0 0 6px var(--pulse-color, #8b5cf655); }
    }
    @keyframes capRingActivate {
      0% { transform: var(--btn-transform) scale(1); opacity: 0.8; }
      40% { transform: var(--btn-transform) scale(1.35); opacity: 1; }
      70% { transform: var(--btn-transform) scale(1.05); }
      100% { transform: var(--btn-transform) scale(1.15); opacity: 1; }
    }
    @keyframes capRingRipple {
      0% { transform: scale(0.5); opacity: 0.6; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .cap-ring-tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(10, 0, 21, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      z-index: 10;
    }
    .cap-ring-tooltip.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);
}

export const CapabilityRing = memo(() => {
  const { dominantCategory } = useToolState();
  const { t } = useTranslation();
  const [containerHovered, setContainerHovered] = useState(false);

  useEffect(() => { injectStyles(); }, []);

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
        opacity: containerHovered ? 0.95 : 0.55,
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
              label={t(ability.labelKey)}
              isActive={isActive}
              color={color}
              x={x}
              y={y - ARC_RADIUS}
              onClick={() => handleClick(t(ability.promptKey))}
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
  const [rippleKey, setRippleKey] = useState(0);
  const [justActivated, setJustActivated] = useState(false);
  const prevActiveRef = useRef(isActive);

  // Detect activation transition
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setJustActivated(true);
      const timer = setTimeout(() => setJustActivated(false), 500);
      return () => clearTimeout(timer);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  const scale = hovered ? 1.2 : isActive ? 1.15 : 1;
  const translateBase = `translate(calc(-50% + ${x}px), calc(${y}px))`;

  const handleClick = useCallback(() => {
    setRippleKey(k => k + 1);
    onClick();
  }, [onClick]);

  return (
    <button
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        background: isActive
          ? `radial-gradient(circle at center, ${color}18, rgba(10, 0, 21, 0.35))`
          : "rgba(10, 0, 21, 0.25)",
        backdropFilter: "blur(12px)",
        border: `1.5px solid ${(hovered || isActive) ? `${color}${hovered ? 'cc' : '99'}` : "rgba(255, 255, 255, 0.12)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        overflow: "hidden",
        transition: justActivated ? "none" : "all 0.3s ease",
        transform: `${translateBase} scale(${scale})`,
        boxShadow: hovered
          ? `0 0 20px ${color}55, 0 0 8px ${color}33`
          : isActive
            ? "none" // handled by pulse animation
            : "none",
        animation: isActive
          ? justActivated
            ? `capRingActivate 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`
            : `capRingPulse 2s ease-in-out infinite`
          : "none",
        font: "inherit",
        color: "inherit",
        padding: 0,
        // CSS custom properties for animation
        "--pulse-color": `${color}88`,
        "--btn-transform": translateBase,
      } as React.CSSProperties}
      onClick={handleClick}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{
        fontSize: "16px",
        lineHeight: 1,
        filter: isActive ? `drop-shadow(0 0 4px ${color}88)` : "none",
        transition: "filter 0.3s ease",
      }}>
        {icon}
      </span>

      {/* Click ripple */}
      {rippleKey > 0 && (
        <span
          key={rippleKey}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${color}44, transparent 70%)`,
            animation: "capRingRipple 0.5s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip */}
      <span className={`cap-ring-tooltip${hovered ? " visible" : ""}`}>
        {label}
      </span>
    </button>
  );
});

AbilityButton.displayName = "AbilityButton";
