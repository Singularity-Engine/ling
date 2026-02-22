import { memo, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAffinity } from "@/context/affinity-context";
import { AFFINITY_LEVELS, DEFAULT_LEVEL } from "@/config/affinity-palette";

// ── Module-level keyframe injection (consistent with BackgroundReactor) ──
const BAR_STYLE_ID = "affinity-bar-keyframes";
function ensureBarStyles() {
  if (typeof document === "undefined" || document.getElementById(BAR_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = BAR_STYLE_ID;
  el.textContent = `
    @keyframes affinityBreathe {
      0%, 100% { box-shadow: 0 0 8px var(--glow-color); }
      50% { box-shadow: 0 0 16px var(--glow-color), 0 0 24px var(--glow-color); }
    }
    @keyframes affinitySlideUp {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(el);
}

export const AffinityBar = memo(() => {
  const { affinity, level, milestone } = useAffinity();
  const { t } = useTranslation();

  const config = useMemo(() => AFFINITY_LEVELS[level] || AFFINITY_LEVELS[DEFAULT_LEVEL], [level]);

  useEffect(ensureBarStyles, []);

  return (
    <>
      <div
        style={{
          padding: "8px 20px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(10, 0, 21, 0.30)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          position: "relative",
          borderTop: "1px solid rgba(139, 92, 246, 0.08)",
        }}
      >
        <span style={{ fontSize: "13px", lineHeight: 1 }} aria-label="affinity icon">
          {config.icon}
        </span>
        <span style={{ fontSize: "13px", color: config.color, fontWeight: 600, transition: "color 0.5s ease", whiteSpace: "nowrap" }}>
          {t(config.i18nKey)}
        </span>
        <div
          style={{
            width: "clamp(100px, 20vw, 160px)",
            height: "6px",
            background: "rgba(255,255,255,0.12)",
            borderRadius: "3px",
            overflow: "hidden",
            position: "relative",
            "--glow-color": `${config.color}33`,
            animation: "affinityBreathe 3s ease-in-out infinite",
          } as React.CSSProperties}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              background: `linear-gradient(90deg, ${config.color}88, ${config.color})`,
              borderRadius: "3px",
              transformOrigin: "left",
              transform: `scaleX(${affinity / 100})`,
              transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease",
            }}
          />
        </div>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", minWidth: "22px", textAlign: "right" }}>
          {affinity}
        </span>

        {milestone && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              marginBottom: "8px",
              background: `linear-gradient(135deg, ${config.color}dd, ${config.color}99)`,
              padding: "8px 20px",
              borderRadius: "20px",
              animation: "affinitySlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: `0 4px 20px ${config.color}44`,
              whiteSpace: "nowrap",
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

AffinityBar.displayName = "AffinityBar";
