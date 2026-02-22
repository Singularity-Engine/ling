import { useTranslation } from "react-i18next";
import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { useAffinity } from "@/context/affinity-context";
import { AFFINITY_CRYSTAL_THEMES, CATEGORY_COLORS, DEFAULT_LEVEL, type AffinityCrystalTheme } from "@/config/affinity-palette";
import type { ToolCategory } from "../../context/tool-state-context";

const DEFAULT_THEME: AffinityCrystalTheme = AFFINITY_CRYSTAL_THEMES[DEFAULT_LEVEL];

// ─── Shared CSS: @property + static keyframes ───────────────────
// @property enables smooth CSS variable transitions when affinity
// level changes. Keyframes reference var() so they pick up live
// values without regeneration — glow color, intensity and float
// range interpolate over 0.8s instead of jumping.
//
// crystalFloat animates --cf-y (a custom property) rather than
// transform directly, so the inline transform remains controllable
// for hover effects.

const SHARED_STYLES = `
@property --cg-r { syntax: '<number>'; inherits: false; initial-value: 96; }
@property --cg-g { syntax: '<number>'; inherits: false; initial-value: 165; }
@property --cg-b { syntax: '<number>'; inherits: false; initial-value: 250; }
@property --cb-lo { syntax: '<length>'; inherits: false; initial-value: 10px; }
@property --cb-hi { syntax: '<length>'; inherits: false; initial-value: 22px; }
@property --cb-lo-a { syntax: '<number>'; inherits: false; initial-value: 0.12; }
@property --cb-hi-a { syntax: '<number>'; inherits: false; initial-value: 0.30; }
@property --cf-y { syntax: '<length>'; inherits: false; initial-value: 0px; }
@property --c-scale { syntax: '<number>'; inherits: false; initial-value: 1; }
@property --c-bg-alpha { syntax: '<number>'; inherits: false; initial-value: 0.60; }
@property --c-blur { syntax: '<length>'; inherits: false; initial-value: 16px; }
@property --ce-scale { syntax: '<number>'; inherits: false; initial-value: 1; }
@property --ce-y { syntax: '<length>'; inherits: false; initial-value: 0px; }

@keyframes crystalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes crystalExpandIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes crystalBreathe {
  0%, 100% { box-shadow: 0 0 var(--cb-lo) rgba(var(--cg-r), var(--cg-g), var(--cg-b), var(--cb-lo-a)); }
  50%      { box-shadow: 0 0 var(--cb-hi) rgba(var(--cg-r), var(--cg-g), var(--cg-b), var(--cb-hi-a)); }
}
@keyframes crystalEnter {
  from { opacity: 0; --ce-scale: 0.5; --ce-y: 40px; }
  to   { opacity: 1; --ce-scale: 1; --ce-y: 0px; }
}
@keyframes crystalFloat {
  0%, 100% { --cf-y: 0px; }
  50%      { --cf-y: var(--cf-range); }
}
@keyframes shimmerSweep {
  0%   { transform: translateX(-100%) rotate(25deg); }
  100% { transform: translateX(200%) rotate(25deg); }
}
`;

let _sharedInjected = false;
function ensureSharedStyles() {
  if (_sharedInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-info-crystal", "");
  el.textContent = SHARED_STYLES;
  document.head.appendChild(el);
  _sharedInjected = true;
}

// ─── Static data ─────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  search: "🔍",
  code: "💻",
  memory: "🧠",
  weather: "🌤️",
  generic: "🔧",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "⚡",
  completed: "✅",
  error: "❌",
};

// Transition string for smooth level changes via @property
const LEVEL_TRANSITION = [
  "--cg-r 0.8s ease", "--cg-g 0.8s ease", "--cg-b 0.8s ease",
  "--cb-lo 0.8s ease", "--cb-hi 0.8s ease",
  "--cb-lo-a 0.8s ease", "--cb-hi-a 0.8s ease",
  "--c-scale 0.8s ease", "--c-bg-alpha 0.8s ease", "--c-blur 0.8s ease",
].join(", ");

// ─── Component ───────────────────────────────────────────────────

interface InfoCrystalProps {
  tool: {
    id: string;
    name: string;
    category: string;
    status: string;
    result?: string;
    partialResult?: string;
  };
  position: "left" | "right" | "center";
  index: number;
  onDismiss?: () => void;
}

export const InfoCrystal = memo(({ tool, position, index }: InfoCrystalProps) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [entered, setEntered] = useState(false);
  const { level } = useAffinity();

  const theme = AFFINITY_CRYSTAL_THEMES[level] || DEFAULT_THEME;

  // Parse glow RGB channels for CSS custom properties
  const [glowR, glowG, glowB] = useMemo(() => {
    const [r, g, b] = theme.glow.split(",").map(s => Number(s.trim()));
    return [r, g, b] as const;
  }, [theme.glow]);

  // Inject shared @property + keyframes once
  useEffect(ensureSharedStyles, []);

  const rotateY = position === "left" ? 5 : position === "right" ? -5 : 0;

  const color = CATEGORY_COLORS[(tool.category as ToolCategory) ?? "generic"] || CATEGORY_COLORS.generic;
  const icon = TOOL_ICONS[tool.category] || TOOL_ICONS.generic;
  const statusIcon = STATUS_ICONS[tool.status] || "⏳";
  const content = tool.result || tool.partialResult || "";
  const animDelay = index * 0.12;

  const handleClick = useCallback(() => setExpanded(p => !p), []);
  const handleOverlayClick = useCallback(() => setExpanded(false), []);
  const handleAnimEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName === "crystalEnter") setEntered(true);
    },
    [],
  );

  // CSS custom properties for theme-dependent animation values
  const cssVars = useMemo<Record<string, string | number>>(() => ({
    "--cg-r": glowR,
    "--cg-g": glowG,
    "--cg-b": glowB,
    "--cb-lo": `${Math.round(10 * theme.breatheIntensity)}px`,
    "--cb-hi": `${Math.round(22 * theme.breatheIntensity)}px`,
    "--cb-lo-a": +(0.12 * theme.breatheIntensity).toFixed(2),
    "--cb-hi-a": +(0.30 * theme.breatheIntensity).toFixed(2),
    "--cf-range": `${-theme.floatRange}px`,
    "--c-scale": theme.scale,
    "--c-bg-alpha": theme.bgAlpha,
    "--c-blur": `${theme.blur}px`,
  }), [glowR, glowG, glowB, theme.breatheIntensity, theme.floatRange, theme.scale, theme.bgAlpha, theme.blur]);

  // ─── Expanded overlay ────────────────────────────────────────

  if (expanded) {
    return (
      <>
        {/* Overlay backdrop */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            zIndex: 998,
            animation: "crystalOverlayIn 0.25s ease-out forwards",
          }}
          onClick={handleOverlayClick}
        />
        {/* Expanded card */}
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            zIndex: 999,
            width: "80vw",
            maxWidth: "720px",
            maxHeight: "70vh",
            background: "rgba(10, 0, 21, 0.85)",
            backdropFilter: "blur(24px)",
            border: `1px solid ${color}66`,
            borderRadius: "20px",
            padding: "24px",
            color: "white",
            overflowY: "auto",
            cursor: "pointer",
            transform: "translate(-50%, -50%)",
            animation: "crystalExpandIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            boxShadow: `0 0 40px rgba(${theme.glow}, 0.2), 0 8px 32px rgba(0, 0, 0, 0.5)`,
          }}
          onClick={handleClick}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "18px", fontWeight: 600, flex: 1 }}>{tool.name}</span>
            <span style={{ fontSize: "14px" }}>{statusIcon}</span>
            <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.35)", cursor: "pointer", marginLeft: "4px", lineHeight: 1 }}>✕</span>
          </div>
          {/* Full content */}
          <span
            style={{
              fontSize: "14px",
              lineHeight: 1.7,
              color: "rgba(255, 255, 255, 0.82)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "block",
            }}
          >
            {content || t("crystal.noContent")}
          </span>
        </div>
      </>
    );
  }

  // ─── Collapsed crystal card ──────────────────────────────────

  // Border color modulated by affinity-level opacity
  const borderHex = hovered
    ? `${color}${Math.round(theme.borderAlpha * 255 * 1.4).toString(16).padStart(2, "0")}`
    : `${color}${Math.round(theme.borderAlpha * 255).toString(16).padStart(2, "0")}`;

  const floatDur = 4 + index * 0.5;
  const currentScale = pressed ? theme.scale * 0.97 : hovered ? theme.scale * 1.03 : theme.scale;
  const currentRotateY = hovered ? rotateY * 0.5 : rotateY;

  return (
    <>
      <div
        style={{
          position: "relative",
          width: "240px",
          minHeight: "80px",
          maxHeight: "200px",
          background: "rgba(10, 0, 21, var(--c-bg-alpha))",
          backdropFilter: "blur(var(--c-blur))",
          border: `1px solid ${borderHex}`,
          borderRadius: "16px",
          padding: "14px 16px",
          color: "white",
          cursor: "pointer",
          overflow: "hidden",
          // --ce-scale/--ce-y are animated by crystalEnter (0.5→1 / 40px→0),
          // then revert to @property initial values (1 / 0px) after the
          // animation ends. Float is driven via --cf-y so it doesn't
          // conflict with hover scale/rotateY changes.
          transform: `perspective(800px) rotateY(${currentRotateY}deg) scale(calc(var(--ce-scale) * ${currentScale})) translateY(calc(var(--ce-y) + var(--cf-y)))`,
          animation: [
            // Position 0: enter or none — keeps positions 1&2 stable so
            // crystalBreathe and crystalFloat don't restart when entered flips.
            entered
              ? "none 0s"
              : `crystalEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay}s backwards`,
            `crystalBreathe 3s ease-in-out ${animDelay}s infinite`,
            `crystalFloat ${floatDur}s ease-in-out ${animDelay + 0.6}s infinite`,
          ].join(", "),
          transition: `transform 0.25s ease, border-color 0.3s ease, ${LEVEL_TRANSITION}`,
          ...cssVars,
        } as React.CSSProperties}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onAnimationEnd={handleAnimEnd}
      >
        {/* Shimmer highlight — always rendered, visibility via opacity transition */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "16px",
            overflow: "hidden",
            pointerEvents: "none",
            opacity: theme.shimmer ? 1 : 0,
            transition: "opacity 0.8s ease",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-50%",
              left: "-50%",
              width: "40%",
              height: "200%",
              background: `linear-gradient(90deg, transparent, rgba(${theme.glow}, 0.08), transparent)`,
              animation: "shimmerSweep 4s ease-in-out infinite",
            }}
          />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <span style={{ fontSize: "15px", lineHeight: 1 }}>{icon}</span>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "0.2px",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "rgba(255, 255, 255, 0.95)",
            }}
          >
            {tool.name}
          </span>
          <span style={{ fontSize: "12px", lineHeight: 1 }}>{statusIcon}</span>
        </div>

        {/* Body - max 3 lines */}
        <span
          style={{
            fontSize: "11.5px",
            lineHeight: 1.6,
            color: "rgba(255, 255, 255, 0.62)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {content || (tool.status === "running" ? t("crystal.running") : t("crystal.waiting"))}
        </span>

        {/* Footer */}
        <span
          style={{
            fontSize: "11px",
            color: `${color}99`,
            marginTop: "10px",
            textAlign: "right",
            display: "block",
          }}
        >
          {t("crystal.clickToView")}
        </span>
      </div>
    </>
  );
});

InfoCrystal.displayName = "InfoCrystal";
