import { useTranslation } from "react-i18next";
import { memo, useState, useCallback, useMemo } from "react";
import type { ToolCategory } from "../../context/tool-state-context";
import { useAffinity } from "@/context/affinity-context";

// ─── Affinity-level visual theme ─────────────────────────────────

interface LevelTheme {
  glow: string;        // RGB for box-shadow glow
  borderAlpha: number; // border opacity multiplier (0–1)
  breatheIntensity: number; // glow radius multiplier
  scale: number;       // base scale (higher affinity → slightly larger)
  floatRange: number;  // px of vertical float animation
  shimmer: boolean;    // whether to show shimmer highlight
}

const LEVEL_THEMES: Record<string, LevelTheme> = {
  hatred:      { glow: "239, 68, 68",   borderAlpha: 0.25, breatheIntensity: 0.6, scale: 0.94, floatRange: 2,  shimmer: false },
  hostile:     { glow: "249, 115, 22",   borderAlpha: 0.3,  breatheIntensity: 0.7, scale: 0.96, floatRange: 3,  shimmer: false },
  indifferent: { glow: "163, 163, 163",  borderAlpha: 0.35, breatheIntensity: 0.8, scale: 0.97, floatRange: 4,  shimmer: false },
  neutral:     { glow: "96, 165, 250",   borderAlpha: 0.4,  breatheIntensity: 1.0, scale: 1.0,  floatRange: 5,  shimmer: false },
  friendly:    { glow: "167, 139, 250",  borderAlpha: 0.5,  breatheIntensity: 1.2, scale: 1.02, floatRange: 6,  shimmer: true  },
  close:       { glow: "192, 132, 252",  borderAlpha: 0.6,  breatheIntensity: 1.4, scale: 1.04, floatRange: 7,  shimmer: true  },
  devoted:     { glow: "244, 114, 182",  borderAlpha: 0.75, breatheIntensity: 1.7, scale: 1.06, floatRange: 8,  shimmer: true  },
};

const DEFAULT_THEME: LevelTheme = LEVEL_THEMES.neutral;

// ─── Keyframes (generated per-instance with theme params) ────────

function buildKeyframes(theme: LevelTheme, id: string) {
  const { glow, breatheIntensity, floatRange } = theme;
  const loR = Math.round(10 * breatheIntensity);
  const hiR = Math.round(22 * breatheIntensity);
  const loA = (0.12 * breatheIntensity).toFixed(2);
  const hiA = (0.30 * breatheIntensity).toFixed(2);
  return `
@keyframes crystalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes crystalExpandIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes crystalEnter-${id} {
  from { opacity: 0; transform: perspective(800px) scale(0.5) translateY(40px); }
  to   { opacity: 1; transform: perspective(800px) scale(${theme.scale}) translateY(0); }
}
@keyframes crystalBreathe-${id} {
  0%, 100% { box-shadow: 0 0 ${loR}px rgba(${glow}, ${loA}); }
  50%      { box-shadow: 0 0 ${hiR}px rgba(${glow}, ${hiA}); }
}
@keyframes crystalFloat-${id} {
  0%, 100% { transform: perspective(800px) scale(${theme.scale}) translateY(0); }
  50%      { transform: perspective(800px) scale(${theme.scale}) translateY(-${floatRange}px); }
}
@keyframes shimmerSweep {
  0%   { transform: translateX(-100%) rotate(25deg); }
  100% { transform: translateX(200%) rotate(25deg); }
}
`;
}

// ─── Static data ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: "#60a5fa",
  code: "#10b981",
  memory: "#a78bfa",
  weather: "#facc15",
  generic: "#8b5cf6",
};

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
  const { level } = useAffinity();

  const theme = LEVEL_THEMES[level] || DEFAULT_THEME;

  // Stable animation-name suffix for this crystal instance
  const animId = useMemo(() => `${index}-${level}`, [index, level]);
  const keyframes = useMemo(() => buildKeyframes(theme, animId), [theme, animId]);

  const color = CATEGORY_COLORS[(tool.category as ToolCategory) ?? "generic"] || CATEGORY_COLORS.generic;
  const icon = TOOL_ICONS[tool.category] || TOOL_ICONS.generic;
  const statusIcon = STATUS_ICONS[tool.status] || "⏳";
  const content = tool.result || tool.partialResult || "";
  const rotateY = position === "left" ? 5 : position === "right" ? -5 : 0;
  const animDelay = index * 0.12;

  const handleClick = useCallback(() => {
    setExpanded((p) => !p);
  }, []);

  const handleOverlayClick = useCallback(() => {
    setExpanded(false);
  }, []);

  // ─── Expanded overlay ────────────────────────────────────────

  if (expanded) {
    return (
      <>
        <style>{keyframes}</style>
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
            <span style={{ fontSize: "16px", fontWeight: 600, flex: 1 }}>
              {tool.name}
            </span>
            <span style={{ fontSize: "14px" }}>{statusIcon}</span>
          </div>
          {/* Full content */}
          <span
            style={{
              fontSize: "13px",
              lineHeight: 1.7,
              color: "rgba(255, 255, 255, 0.8)",
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

  return (
    <>
      <style>{keyframes}</style>
      <div
        style={{
          position: "relative",
          width: "200px",
          minHeight: "80px",
          maxHeight: "200px",
          background: "rgba(10, 0, 21, 0.6)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${borderHex}`,
          borderRadius: "16px",
          padding: "12px 14px",
          color: "white",
          cursor: "pointer",
          overflow: "hidden",
          transform: hovered
            ? `perspective(800px) rotateY(${rotateY * 0.5}deg) scale(${theme.scale * 1.03})`
            : `perspective(800px) rotateY(${rotateY}deg) scale(${theme.scale})`,
          animation: [
            `crystalEnter-${animId} 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay}s both`,
            `crystalBreathe-${animId} 3s ease-in-out ${animDelay}s infinite`,
            `crystalFloat-${animId} ${4 + index * 0.5}s ease-in-out ${animDelay + 0.6}s infinite`,
          ].join(", "),
          transition: "transform 0.25s ease, border-color 0.3s ease, box-shadow 0.3s ease",
        }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Shimmer highlight for high affinity */}
        {theme.shimmer && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "16px",
              overflow: "hidden",
              pointerEvents: "none",
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
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
          <span style={{ fontSize: "14px", lineHeight: 1 }}>{icon}</span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            {tool.name}
          </span>
          <span style={{ fontSize: "12px", lineHeight: 1 }}>{statusIcon}</span>
        </div>

        {/* Body - max 3 lines */}
        <span
          style={{
            fontSize: "11px",
            lineHeight: 1.5,
            color: "rgba(255, 255, 255, 0.6)",
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
            fontSize: "10px",
            color: `${color}99`,
            marginTop: "6px",
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
