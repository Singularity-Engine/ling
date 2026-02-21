import { memo, useState, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAffinity } from "@/context/affinity-context";

const keyframesStyle = `
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

const LEVEL_CONFIG: Record<string, { i18nKey: string; color: string; heartColor: string; beatSpeed: string }> = {
  hatred: { i18nKey: "affinity.hatred", color: "#f87171", heartColor: "#4a1515", beatSpeed: "3s" },
  hostile: { i18nKey: "affinity.hostile", color: "#f97316", heartColor: "#6b3a1a", beatSpeed: "2.5s" },
  indifferent: { i18nKey: "affinity.indifferent", color: "#a3a3a3", heartColor: "#525252", beatSpeed: "2.2s" },
  neutral: { i18nKey: "affinity.neutral", color: "#60a5fa", heartColor: "#60a5fa", beatSpeed: "2s" },
  friendly: { i18nKey: "affinity.friendly", color: "#a78bfa", heartColor: "#a78bfa", beatSpeed: "1.6s" },
  close: { i18nKey: "affinity.close", color: "#c084fc", heartColor: "#c084fc", beatSpeed: "1.2s" },
  devoted: { i18nKey: "affinity.devoted", color: "#f472b6", heartColor: "#f472b6", beatSpeed: "0.8s" },
};

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
  const { t } = useTranslation();

  const config = useMemo(() => LEVEL_CONFIG[level] || LEVEL_CONFIG.neutral, [level]);

  return (
    <>
      <style>{keyframesStyle}</style>
      <div style={{ position: "relative" }}>
        {/* Heart button */}
        <button
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 12px",
            minHeight: "44px",
            background: hovered ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(12px)",
            borderRadius: "20px",
            border: hovered ? `1px solid ${config.color}44` : "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            animation: `heartbeat ${config.beatSpeed} ease-in-out infinite`,
            font: "inherit",
            color: "inherit",
          }}
        >
          <HeartIcon color={config.heartColor} fillPercent={affinity} size={22} />
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
              padding: "16px",
              background: "rgba(10, 0, 21, 0.9)",
              backdropFilter: "blur(20px)",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.1)",
              minWidth: "180px",
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${config.color}22`,
              transition: "box-shadow 0.5s ease",
              animation: "fadeInDown 0.2s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <HeartIcon color={config.heartColor} fillPercent={affinity} size={28} />
              <div>
                <span style={{ fontSize: "14px", color: config.color, fontWeight: 700, display: "block", transition: "color 0.5s ease" }}>
                  {t(config.i18nKey)}
                </span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block" }}>
                  {t("affinity.label")}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", marginBottom: "8px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: `linear-gradient(90deg, ${config.color}88, ${config.color})`,
                  borderRadius: "2px",
                  transformOrigin: "left",
                  transform: `scaleX(${affinity / 100})`,
                  transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>0</span>
              <span style={{ fontSize: "12px", color: config.color, fontWeight: 600, transition: "color 0.5s ease" }}>{affinity}/100</span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>100</span>
            </div>

          </div>
        )}

        {/* Milestone popup */}
        {milestone && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              padding: "8px 14px",
              background: `linear-gradient(135deg, ${config.color}dd, ${config.color}99)`,
              borderRadius: "16px",
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
