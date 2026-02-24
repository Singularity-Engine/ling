import { useTranslation } from "react-i18next";
import { memo, useState, useCallback, useMemo, type CSSProperties } from "react";
import { useAffinityMeta } from "@/context/AffinityContext";
import { AFFINITY_CRYSTAL_THEMES, CATEGORY_COLORS, DEFAULT_LEVEL, type AffinityCrystalTheme } from "@/config/affinity-palette";
// @property rules + keyframes moved to static index.css — no runtime injection needed.
import type { ToolCategory } from "../../context/ToolStateContext";

const DEFAULT_THEME: AffinityCrystalTheme = AFFINITY_CRYSTAL_THEMES[DEFAULT_LEVEL];

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
  "--cb-hi 0.8s ease", "--cb-hi-a 0.8s ease",
  "--c-scale 0.8s ease", "--c-bg-alpha 0.8s ease", "--c-blur 0.8s ease",
].join(", ");

// ─── Static style constants (avoid per-render allocation) ────────

// Expanded overlay
const S_OVERLAY: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.6)",
  zIndex: 998, animation: "crystalOverlayIn 0.25s ease-out forwards",
};
const _S_EXPAND_BASE: CSSProperties = {
  position: "fixed", top: "50%", left: "50%", zIndex: 999,
  width: "80vw", maxWidth: "720px", maxHeight: "70vh",
  background: "rgba(10, 0, 21, 0.92)", backdropFilter: "blur(24px)",
  borderRadius: "16px", padding: "24px", color: "white",
  overflowY: "auto", cursor: "pointer", transform: "translate(-50%, -50%)",
  animation: "crystalExpandIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
};
const S_EXP_HEADER: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" };
const S_EXP_ICON: CSSProperties = { fontSize: "20px" };
const S_EXP_NAME: CSSProperties = { fontSize: "18px", fontWeight: 600, flex: 1 };
const S_EXP_STATUS: CSSProperties = { fontSize: "14px" };
const S_EXP_CLOSE_BTN: CSSProperties = { fontSize: "18px", color: "rgba(255,255,255,0.35)", cursor: "pointer", marginLeft: "4px", lineHeight: 1, background: "none", border: "none", padding: 0, font: "inherit" };
const S_EXP_CONTENT: CSSProperties = {
  fontSize: "14px", lineHeight: 1.7, color: "rgba(255, 255, 255, 0.88)",
  whiteSpace: "pre-wrap", wordBreak: "break-word", display: "block",
};

// Collapsed crystal card — static parts
const _S_CARD_BASE: CSSProperties = {
  position: "relative", width: "min(240px, calc(100vw - 80px))",
  minHeight: "80px", maxHeight: "200px",
  background: "rgba(10, 0, 21, var(--c-bg-alpha))",
  backdropFilter: "blur(var(--c-blur))", borderRadius: "16px",
  padding: "14px 16px", color: "white", cursor: "pointer",
};
const _S_SHIMMER_OUTER_BASE: CSSProperties = {
  position: "absolute", inset: 0, borderRadius: "16px",
  overflow: "hidden", pointerEvents: "none", transition: "opacity 0.8s ease",
};
const S_SHIMMER_OUTER_ON: CSSProperties = { ..._S_SHIMMER_OUTER_BASE, opacity: 1 };
const S_SHIMMER_OUTER_OFF: CSSProperties = { ..._S_SHIMMER_OUTER_BASE, opacity: 0 };
const _S_SHIMMER_INNER_BASE: CSSProperties = {
  position: "absolute", top: "-50%", left: "-50%", width: "40%", height: "200%",
  animation: "shimmerSweep 4s ease-in-out infinite",
};
const S_CARD_HEADER: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" };
const S_CARD_ICON: CSSProperties = { fontSize: "15px", lineHeight: 1 };
const _S_CARD_NAME_BASE: CSSProperties = {
  fontSize: "15px", fontWeight: 600, letterSpacing: "0.2px", flex: 1,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const S_CARD_STATUS: CSSProperties = { fontSize: "12px", lineHeight: 1 };
const S_CARD_BODY: CSSProperties = {
  fontSize: "13px", lineHeight: 1.6, color: "rgba(255, 255, 255, 0.78)",
  overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
  WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
};

// Lazily-cached dynamic styles keyed by color/glow — avoids creating new objects
// in the render path while supporting per-category/per-theme variation.
const _expandCardCache = new Map<string, CSSProperties>();
function getExpandCardStyle(color: string, glow: string): CSSProperties {
  const key = `${color}:${glow}`;
  let s = _expandCardCache.get(key);
  if (!s) {
    s = {
      ..._S_EXPAND_BASE,
      border: `1px solid ${color}66`,
      boxShadow: `0 12px 40px rgba(0, 0, 0, 0.5), 0 0 24px rgba(${glow}, 0.15)`,
    };
    _expandCardCache.set(key, s);
  }
  return s;
}

const _shimmerInnerCache = new Map<string, CSSProperties>();
function getShimmerInnerStyle(glow: string): CSSProperties {
  let s = _shimmerInnerCache.get(glow);
  if (!s) {
    s = { ..._S_SHIMMER_INNER_BASE, background: `linear-gradient(90deg, transparent, rgba(${glow}, 0.08), transparent)` };
    _shimmerInnerCache.set(glow, s);
  }
  return s;
}

const _cardNameCache = new Map<string, CSSProperties>();
function getCardNameStyle(color: string): CSSProperties {
  let s = _cardNameCache.get(color);
  if (!s) {
    s = { ..._S_CARD_NAME_BASE, color: `color-mix(in srgb, ${color} 25%, rgba(255, 255, 255, 0.95))` };
    _cardNameCache.set(color, s);
  }
  return s;
}

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
}

export const InfoCrystal = memo(({ tool, position, index }: InfoCrystalProps) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [entered, setEntered] = useState(false);
  const { level } = useAffinityMeta();

  const theme = AFFINITY_CRYSTAL_THEMES[level] || DEFAULT_THEME;

  // Parse glow RGB channels for CSS custom properties
  const [glowR, glowG, glowB] = useMemo(() => {
    const [r, g, b] = theme.glow.split(",").map(s => Number(s.trim()));
    return [r, g, b] as const;
  }, [theme.glow]);

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
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(p => !p); }
  }, []);
  const onOverlayKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setExpanded(false);
  }, []);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => { setHovered(false); setPressed(false); }, []);
  const onDown = useCallback(() => setPressed(true), []);
  const onUp = useCallback(() => setPressed(false), []);

  // CSS custom properties for theme-dependent animation values
  const cssVars = useMemo<Record<string, string | number>>(() => ({
    "--cg-r": glowR,
    "--cg-g": glowG,
    "--cg-b": glowB,
    "--cb-hi": `${Math.round(22 * theme.breatheIntensity)}px`,
    "--cb-hi-a": +(0.30 * theme.breatheIntensity).toFixed(2),
    "--cf-range": `${-theme.floatRange}px`,
    "--c-scale": theme.scale,
    "--c-bg-alpha": theme.bgAlpha,
    "--c-blur": `${theme.blur}px`,
    "--crystal-delay": `${animDelay}s`,
  }), [glowR, glowG, glowB, theme.breatheIntensity, theme.floatRange, theme.scale, theme.bgAlpha, theme.blur, animDelay]);

  // ─── Expanded overlay ────────────────────────────────────────

  if (expanded) {
    return (
      <>
        {/* Overlay backdrop */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div style={S_OVERLAY} onClick={handleOverlayClick} onKeyDown={onOverlayKeyDown} />
        {/* Expanded card */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tool.name}
          style={getExpandCardStyle(color, theme.glow)}
          onClick={handleClick}
          onKeyDown={onKeyDown}
          tabIndex={0}
        >
          {/* Header */}
          <div style={S_EXP_HEADER}>
            <span style={S_EXP_ICON} aria-hidden="true">{icon}</span>
            <span style={S_EXP_NAME}>{tool.name}</span>
            <span style={S_EXP_STATUS} aria-label={tool.status}>{statusIcon}</span>
            <button
              style={S_EXP_CLOSE_BTN}
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              aria-label={t("common.close")}
            >✕</button>
          </div>
          {/* Full content */}
          <span style={S_EXP_CONTENT}>
            {content || t("crystal.noContent")}
          </span>
        </div>
      </>
    );
  }

  // ─── Collapsed crystal card ──────────────────────────────────

  // Border color modulated by affinity-level opacity
  const borderHex = hovered
    ? `${color}${Math.min(255, Math.round(theme.borderAlpha * 255 * 1.4)).toString(16).padStart(2, "0")}`
    : `${color}${Math.round(theme.borderAlpha * 255).toString(16).padStart(2, "0")}`;

  const floatDur = 4 + index * 0.5;
  const currentScale = pressed ? theme.scale * 0.97 : hovered ? theme.scale * 1.03 : theme.scale;
  const currentRotateY = hovered ? rotateY * 0.5 : rotateY;

  // Main card style is inherently dynamic (border, transform, animation, cssVars)
  // but we build it from the pre-allocated _S_CARD_BASE to minimize spreading.
  const cardStyle = useMemo<React.CSSProperties>(() => ({
    ..._S_CARD_BASE,
    border: `1px solid ${borderHex}`,
    // --ce-scale/--ce-y are animated by crystalEnter (0.5→1 / 40px→0),
    // then revert to @property initial values (1 / 0px) after the
    // animation ends. Float is driven via --cf-y so it doesn't
    // conflict with hover scale/rotateY changes.
    transform: `perspective(800px) rotateY(${currentRotateY}deg) scale(calc(var(--ce-scale) * ${currentScale})) translateY(calc(var(--ce-y) + var(--cf-y)))`,
    animation: [
      // Position 0: enter or none — keeps position 1 stable so
      // crystalFloat doesn't restart when entered flips.
      // crystalBreathe is now GPU-driven via ::after (see .ling-crystal-card in CSS).
      entered
        ? "none 0s"
        : `crystalEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay}s backwards`,
      `crystalFloat ${floatDur}s ease-in-out ${animDelay + 0.6}s infinite`,
    ].join(", "),
    transition: `transform 0.25s ease, border-color 0.3s ease, ${LEVEL_TRANSITION}`,
    ...cssVars,
  }), [borderHex, currentRotateY, currentScale, entered, animDelay, floatDur, cssVars]);

  return (
    <>
      <div
        className="ling-crystal-card"
        role="button"
        tabIndex={0}
        aria-label={`${tool.name} — ${tool.status}`}
        aria-expanded={false}
        style={cardStyle}
        onClick={handleClick}
        onKeyDown={onKeyDown}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onAnimationEnd={handleAnimEnd}
      >
        {/* Shimmer highlight — always rendered, visibility via opacity transition */}
        <div style={theme.shimmer ? S_SHIMMER_OUTER_ON : S_SHIMMER_OUTER_OFF}>
          <div style={getShimmerInnerStyle(theme.glow)} />
        </div>

        {/* Header */}
        <div style={S_CARD_HEADER}>
          <span style={S_CARD_ICON} aria-hidden="true">{icon}</span>
          <span style={getCardNameStyle(color)}>{tool.name}</span>
          <span style={S_CARD_STATUS} aria-label={tool.status}>{statusIcon}</span>
        </div>

        {/* Body - max 3 lines */}
        <span style={S_CARD_BODY}>
          {content || (tool.status === "running" ? t("crystal.running") : t("crystal.waiting"))}
        </span>
      </div>
    </>
  );
});

InfoCrystal.displayName = "InfoCrystal";
