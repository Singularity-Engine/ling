import { useTranslation } from "react-i18next";
import { memo, useState, useCallback } from "react";
import type { ToolCategory } from "../../context/tool-state-context";

const keyframesStyle = `
@keyframes crystalOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes crystalExpandIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes crystalEnter {
  from { opacity: 0; transform: perspective(800px) scale(0.5) translateY(40px); }
  to { opacity: 1; transform: perspective(800px) scale(1) translateY(0); }
}
@keyframes crystalBreathe {
  0%, 100% { box-shadow: 0 0 15px rgba(139, 92, 246, 0.13); }
  50% { box-shadow: 0 0 25px rgba(139, 92, 246, 0.27); }
}
`;

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

  if (expanded) {
    return (
      <>
        <style>{keyframesStyle}</style>
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
            boxShadow: `0 0 40px ${color}33, 0 8px 32px rgba(0, 0, 0, 0.5)`,
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

  return (
    <>
      <style>{keyframesStyle}</style>
      <div
        style={{
          width: "200px",
          minHeight: "80px",
          maxHeight: "200px",
          background: "rgba(10, 0, 21, 0.6)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${hovered ? `${color}88` : `${color}55`}`,
          borderRadius: "16px",
          padding: "12px 14px",
          color: "white",
          cursor: "pointer",
          overflow: "hidden",
          transform: hovered
            ? `perspective(800px) rotateY(${rotateY * 0.5}deg) scale(1.03)`
            : `perspective(800px) rotateY(${rotateY}deg)`,
          animation: `crystalEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay}s both, crystalBreathe 3s ease-in-out ${animDelay}s infinite`,
          transition: "transform 0.2s ease, border-color 0.3s ease",
        }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
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
