import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAffinity } from "@/context/affinity-context";

const breatheKeyframes = `
@keyframes affinityBreathe {
  0%, 100% { box-shadow: 0 0 8px var(--glow-color); }
  50% { box-shadow: 0 0 16px var(--glow-color), 0 0 24px var(--glow-color); }
}
@keyframes affinityIconFade {
  0% { opacity: 0; transform: scale(0.6); }
  100% { opacity: 1; transform: scale(1); }
}
`;

const slideUpKeyframes = `
@keyframes affinitySlideUp {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
`;

const LEVEL_CONFIG: Record<string, { i18nKey: string; color: string; icon: string }> = {
  hatred: { i18nKey: "affinity.hatred", color: "#ef4444", icon: "💔" },
  hostile: { i18nKey: "affinity.hostile", color: "#f97316", icon: "❄️" },
  indifferent: { i18nKey: "affinity.indifferent", color: "#a3a3a3", icon: "😐" },
  neutral: { i18nKey: "affinity.neutral", color: "#60a5fa", icon: "💙" },
  friendly: { i18nKey: "affinity.friendly", color: "#a78bfa", icon: "💜" },
  close: { i18nKey: "affinity.close", color: "#c084fc", icon: "💗" },
  devoted: { i18nKey: "affinity.devoted", color: "#f472b6", icon: "💕" },
};

export const AffinityBar = memo(() => {
  const { affinity, level, milestone } = useAffinity();
  const { t } = useTranslation();

  const config = useMemo(() => LEVEL_CONFIG[level] || LEVEL_CONFIG.neutral, [level]);

  return (
    <>
      <style>{breatheKeyframes}{slideUpKeyframes}</style>
      <div
        style={{
          padding: "8px 16px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          position: "relative",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px" }} aria-label="affinity icon">
            {config.icon}
          </span>
          <span style={{ fontSize: "12px", color: config.color, fontWeight: 600, transition: "color 0.5s ease" }}>
            {t(config.i18nKey)}
          </span>
          <div
            style={{
              width: "100px",
              height: "6px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "3px",
              overflow: "hidden",
              position: "relative",
              "--glow-color": `${config.color}44`,
              animation: "affinityBreathe 3s ease-in-out infinite",
            } as React.CSSProperties}
          >
            <div
              style={{
                height: "100%",
                width: "100%",
                background: `linear-gradient(90deg, ${config.color}99, ${config.color})`,
                borderRadius: "3px",
                transformOrigin: "left",
                transform: `scaleX(${affinity / 100})`,
                transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", minWidth: "24px", textAlign: "right" }}>
            {affinity}
          </span>
        </div>

        <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.1)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            🧠
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
          </span>
        </div>

        {milestone && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              marginBottom: "8px",
              background: `linear-gradient(135deg, ${config.color}dd, ${config.color}99)`,
              padding: "8px 20px",
              borderRadius: "24px",
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
