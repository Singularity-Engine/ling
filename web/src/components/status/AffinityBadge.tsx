import { memo, useState, useId, useMemo, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useAffinityState } from "@/context/affinity-context";
import { AFFINITY_LEVELS, DEFAULT_LEVEL } from "@/config/affinity-palette";
import { LEVELS } from "@/hooks/use-affinity-engine";
import { createStyleInjector } from "@/utils/style-injection";

// ── Deferred style injection (avoids module-level side effects) ──
const ensureBadgeStyles = createStyleInjector({
  id: "affinity-badge-keyframes",
  css: `
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
  `,
});

// ── Pre-allocated style constants ──
const S_WRAPPER: CSSProperties = { position: "relative" };

const S_BTN_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  backdropFilter: "blur(12px)",
  borderRadius: "16px",
  cursor: "pointer",
  transition: "background 0.3s ease, border-color 0.3s ease, transform 0.3s ease",
  font: "inherit",
  color: "inherit",
};

const S_HEART_WRAP: CSSProperties = { display: "inline-flex" };

const S_LEVEL_LABEL_BASE: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  transition: "color 0.3s ease",
};

const S_AFFINITY_VALUE_HIDDEN: CSSProperties = {
  fontSize: "12px",
  color: "rgba(255,255,255,0.7)",
  fontFamily: "monospace",
  fontWeight: 500,
  overflow: "hidden",
  maxWidth: "0px",
  opacity: 0,
  transition: "max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  whiteSpace: "nowrap",
};

const S_AFFINITY_VALUE_VISIBLE: CSSProperties = {
  ...S_AFFINITY_VALUE_HIDDEN,
  maxWidth: "40px",
  opacity: 1,
};

const S_PANEL_BASE: CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "8px",
  padding: "20px",
  background: "rgba(10, 0, 21, 0.92)",
  backdropFilter: "blur(24px)",
  borderRadius: "16px",
  minWidth: "200px",
  transition: "box-shadow 0.5s ease, border-color 0.5s ease",
  animation: "fadeInDown 0.25s ease-out",
};

const S_PANEL_HEADER: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" };
const S_PANEL_FLEX1: CSSProperties = { flex: 1 };
const S_PANEL_LEVEL_NAME: CSSProperties = { fontSize: "15px", fontWeight: 700, display: "block", letterSpacing: "0.3px", transition: "color 0.5s ease" };
const S_PANEL_SUBLABEL: CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "2px" };
const S_PANEL_SCORE: CSSProperties = { fontSize: "22px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "-0.5px", transition: "color 0.5s ease" };

const S_PROGRESS_WRAP: CSSProperties = { marginBottom: "14px" };
const S_PROGRESS_HEADER: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" };
const S_PROGRESS_LABEL: CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.5)" };
const S_PROGRESS_RANGE: CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" };
const S_PROGRESS_TRACK: CSSProperties = { width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" };
const S_PROGRESS_FILL_BASE: CSSProperties = { height: "100%", width: "100%", borderRadius: "3px", transformOrigin: "left", transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease" };

const S_NEXT_LEVEL_WRAP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 10px",
  background: "rgba(255,255,255,0.04)",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.06)",
};
const S_NEXT_LABEL: CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.4)" };
const S_NEXT_RANGE: CSSProperties = { fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginLeft: "auto" };

const S_MILESTONE_BASE: CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "8px",
  padding: "8px 14px",
  borderRadius: "20px",
  whiteSpace: "nowrap",
  animation: "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
};
const S_MILESTONE_TEXT: CSSProperties = { fontSize: "13px", color: "white", fontWeight: 500 };
const S_HEART_PATH: CSSProperties = { transition: "stroke 0.5s ease" };

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
        style={S_HEART_PATH}
      />
    </svg>
  );
};

export const AffinityBadge = memo(() => {
  useEffect(ensureBadgeStyles, []);
  const { affinity, level, milestone } = useAffinityState();
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { t } = useTranslation();

  const config = useMemo(() => AFFINITY_LEVELS[level] || AFFINITY_LEVELS[DEFAULT_LEVEL], [level]);

  // Current & next level info for expanded panel
  const levelInfo = useMemo(() => {
    const idx = LEVELS.findIndex(l => l.level === level);
    const current = idx >= 0 ? LEVELS[idx] : LEVELS[3]; // fallback neutral
    const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
    const rangeSize = current.max - current.min;
    const progressInLevel = rangeSize > 0 ? ((affinity - current.min) / rangeSize) * 100 : 100;
    return { current, next, progressInLevel: Math.min(100, Math.max(0, progressInLevel)) };
  }, [level, affinity]);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Stabilized event handlers ──
  const toggleExpanded = useCallback(() => setExpanded(v => !v), []);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => { setHovered(false); setPressed(false); }, []);
  const onMouseDown = useCallback(() => setPressed(true), []);
  const onMouseUp = useCallback(() => setPressed(false), []);

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

  // ── Computed styles (depend on hover/press/config state) ──
  const btnStyle = useMemo<CSSProperties>(() => ({
    ...S_BTN_BASE,
    background: pressed ? "rgba(0, 0, 0, 0.55)" : hovered ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.35)",
    border: hovered ? `1px solid ${config.color}44` : "1px solid rgba(255,255,255,0.08)",
    transform: pressed ? "scale(0.95)" : "scale(1)",
  }), [pressed, hovered, config.color]);

  const heartWrapStyle = useMemo<CSSProperties>(
    () => ({ ...S_HEART_WRAP, animation: `heartbeat ${config.beatSpeed} ease-in-out infinite` }),
    [config.beatSpeed],
  );

  // Consolidate all config.color-dependent styles into a single memo
  // (avoids 5 separate shallow-compare + object-creation cycles per render)
  const configStyles = useMemo(() => ({
    levelLabel: { ...S_LEVEL_LABEL_BASE, color: `${config.color}cc` } as CSSProperties,
    panel: {
      ...S_PANEL_BASE,
      border: `1px solid ${config.color}38`,
      boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 24px ${config.color}15`,
    } as CSSProperties,
    panelLevelName: { ...S_PANEL_LEVEL_NAME, color: config.color } as CSSProperties,
    panelScore: { ...S_PANEL_SCORE, color: config.color } as CSSProperties,
    milestone: {
      ...S_MILESTONE_BASE,
      background: `linear-gradient(135deg, ${config.color}dd, ${config.color}99)`,
      boxShadow: `0 4px 20px ${config.color}44`,
    } as CSSProperties,
  }), [config.color]);

  const progressFillStyle = useMemo<CSSProperties>(
    () => ({
      ...S_PROGRESS_FILL_BASE,
      background: `linear-gradient(90deg, ${config.color}66, ${config.color})`,
      transform: `scaleX(${levelInfo.progressInLevel / 100})`,
      boxShadow: `0 0 8px ${config.color}33`,
    }),
    [config.color, levelInfo.progressInLevel],
  );

  const nextConfig = useMemo(
    () => levelInfo.next ? (AFFINITY_LEVELS[levelInfo.next.level] || AFFINITY_LEVELS[DEFAULT_LEVEL]) : null,
    [levelInfo.next],
  );

  const nextLevelNameStyle = useMemo<CSSProperties | undefined>(
    () => nextConfig ? { fontSize: "11px", color: nextConfig.color, fontWeight: 600 } : undefined,
    [nextConfig],
  );

  return (
    <>
      <div ref={containerRef} style={S_WRAPPER}>
        {/* Heart button */}
        <button
          onClick={toggleExpanded}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          aria-label={t("affinity.label")}
          style={btnStyle}
        >
          <span style={heartWrapStyle}>
            <HeartIcon color={config.heartColor} fillPercent={affinity} size={22} />
          </span>
          <span style={configStyles.levelLabel}>
            {t(config.i18nKey)}
          </span>
          <span style={hovered ? S_AFFINITY_VALUE_VISIBLE : S_AFFINITY_VALUE_HIDDEN}>
            {affinity}
          </span>
        </button>

        {/* Expanded panel */}
        {expanded && (
          <div style={configStyles.panel}>
            {/* Header: heart + level info */}
            <div style={S_PANEL_HEADER}>
              <HeartIcon color={config.heartColor} fillPercent={affinity} size={32} />
              <div style={S_PANEL_FLEX1}>
                <span style={configStyles.panelLevelName}>
                  {t(config.i18nKey)}
                </span>
                <span style={S_PANEL_SUBLABEL}>
                  {t("affinity.label")}
                </span>
              </div>
              <span style={configStyles.panelScore}>
                {affinity}
              </span>
            </div>

            {/* Level progress bar */}
            <div style={S_PROGRESS_WRAP}>
              <div style={S_PROGRESS_HEADER}>
                <span style={S_PROGRESS_LABEL}>
                  {t("affinity.currentLevel")}
                </span>
                <span style={S_PROGRESS_RANGE}>
                  {levelInfo.current.min}–{levelInfo.current.max === 101 ? 100 : levelInfo.current.max}
                </span>
              </div>
              <div style={S_PROGRESS_TRACK}>
                <div style={progressFillStyle} />
              </div>
            </div>

            {/* Next level hint */}
            {nextConfig && levelInfo.next && (
              <div style={S_NEXT_LEVEL_WRAP}>
                <span style={S_NEXT_LABEL}>
                  {t("affinity.nextLevel")}
                </span>
                <span style={nextLevelNameStyle}>
                  {t(nextConfig.i18nKey)}
                </span>
                <span style={S_NEXT_RANGE}>
                  {levelInfo.next.min}+
                </span>
              </div>
            )}

          </div>
        )}

        {/* Milestone popup — hidden when expanded panel is open to avoid overlap */}
        {milestone && !expanded && (
          <div style={configStyles.milestone}>
            <span style={S_MILESTONE_TEXT}>
              ✨ {milestone}
            </span>
          </div>
        )}
      </div>
    </>
  );
});

AffinityBadge.displayName = "AffinityBadge";
