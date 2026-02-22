import { memo, useState, useId, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAffinity } from "@/context/affinity-context";
import { AFFINITY_LEVELS, DEFAULT_LEVEL } from "@/config/affinity-palette";

// ── Module-level keyframe injection (consistent with BackgroundReactor) ──
const BADGE_STYLE_ID = "affinity-badge-keyframes";
function ensureBadgeStyles() {
  if (typeof document === "undefined" || document.getElementById(BADGE_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = BADGE_STYLE_ID;
  el.textContent = `
    @keyframes heartbeat {
      0%, 100% { transform: scale(1); }
      14% { transform: scale(1.1); }
      28% { transform: scale(1); }
      42% { transform: scale(1.08); }
      70% { transform: scale(1); }
    }
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes popIn {
      from { opacity: 0; transform: scale(0.8) translateY(-4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head.appendChild(el);
}

const HeartIcon = ({ color, fillPercent, size = 32 }: { color: string; fillPercent: number; size?: number }) => {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          <stop offset={`${fillPercent}%`} stopColor={color} />
          <stop offset={`${fillPercent}%`} stopColor={`${color}33`} />
        </linearGradient>
      </defs>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={`url(#${gradientId})`}
        stroke={color}
        strokeWidth="0.5"
        style={{ transition: "stroke 0.5s ease" }}
      />
    </svg>
  );
};

export const AffinityBadge = memo(() => {
  const { affinity, level, milestone } = useAffinity();
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { t } = useTranslation();

  const config = useMemo(() => AFFINITY_LEVELS[level] || AFFINITY_LEVELS[DEFAULT_LEVEL], [level]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(ensureBadgeStyles, []);

  // Close expanded panel on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setExpanded(false);
    }
  }, []);
  useEffect(() => {
    if (expanded) {
      document.addEventListener("pointerdown", handleClickOutside);
      return () => document.removeEventListener("pointerdown", handleClickOutside);
    }
  }, [expanded, handleClickOutside]);

  return (
    <>
      <div ref={containerRef} style={{ position: "relative" }}>
        {/* Heart button */}
        <button
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setPressed(false); }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 10px",
            background: pressed ? "rgba(0, 0, 0, 0.55)" : hovered ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(12px)",
            borderRadius: "16px",
            border: hovered ? `1px solid ${config.color}44` : "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            transform: pressed ? "scale(0.95)" : "scale(1)",
            font: "inherit",
            color: "inherit",
          }}
        >
          <span style={{ display: "inline-flex", animation: `heartbeat ${config.beatSpeed} ease-in-out infinite` }}>
            <HeartIcon color={config.heartColor} fillPercent={affinity} size={22} />
          </span>
          <span style={{ fontSize: "12px", color: `${config.color}cc`, fontWeight: 600, transition: "all 0.3s ease" }}>
            {t(config.i18nKey)}
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.7)",
              fontFamily: "monospace",
              fontWeight: 500,
              overflow: "hidden",
              maxWidth: hovered ? "40px" : "0px",
              opacity: hovered ? 1 : 0,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              whiteSpace: "nowrap",
            }}
          >
            {affinity}
          </span>
        </button>

        {/* Expanded panel */}
        {expanded && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              padding: "20px",
              background: "rgba(10, 0, 21, 0.92)",
              backdropFilter: "blur(24px)",
              borderRadius: "16px",
              border: `1px solid ${config.color}38`,
              minWidth: "200px",
              boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 24px ${config.color}15`,
              transition: "box-shadow 0.5s ease, border-color 0.5s ease",
              animation: "fadeInDown 0.25s ease-out",
            }}
          >
            {/* Header: heart + level info */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <HeartIcon color={config.heartColor} fillPercent={affinity} size={32} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "15px", color: config.color, fontWeight: 700, display: "block", letterSpacing: "0.3px", transition: "color 0.5s ease" }}>
                  {t(config.i18nKey)}
                </span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", display: "block", marginTop: "2px" }}>
                  {t("affinity.label")}
                </span>
              </div>
              <span style={{ fontSize: "20px", color: config.color, fontWeight: 700, fontFamily: "monospace", letterSpacing: "-0.5px", transition: "color 0.5s ease" }}>
                {affinity}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.12)", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: `linear-gradient(90deg, ${config.color}66, ${config.color})`,
                  borderRadius: "3px",
                  transformOrigin: "left",
                  transform: `scaleX(${affinity / 100})`,
                  transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease",
                  boxShadow: `0 0 8px ${config.color}33`,
                }}
              />
            </div>

            {/* Score range label */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>0</span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>100</span>
            </div>

          </div>
        )}

        {/* Milestone popup — hidden when expanded panel is open to avoid overlap */}
        {milestone && !expanded && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              padding: "8px 14px",
              background: `linear-gradient(135deg, ${config.color}dd, ${config.color}99)`,
              borderRadius: "20px",
              boxShadow: `0 4px 20px ${config.color}44`,
              whiteSpace: "nowrap",
              animation: "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <span style={{ fontSize: "13px", color: "white", fontWeight: 500 }}>
              ✨ {milestone}
            </span>
          </div>
        )}
      </div>
    </>
  );
});

AffinityBadge.displayName = "AffinityBadge";
