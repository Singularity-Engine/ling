import { memo } from "react";

// Inject animation styles once
const STYLE_ID = "typing-indicator-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes typingFadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes thinkingDot {
      0%, 80%, 100% { opacity: 0.35; transform: translateY(0) scale(0.85); }
      40% { opacity: 1; transform: translateY(-6px) scale(1.1); }
    }
    @keyframes thinkingPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
      50% { box-shadow: 0 0 12px 2px rgba(139, 92, 246, 0.08); }
    }
    @keyframes thinkingFadeOut {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.92); }
    }
  `;
  document.head.appendChild(style);
}

const DOT_COLORS = [
  "linear-gradient(135deg, #a78bfa, #8b5cf6)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
];

interface TypingIndicatorProps {
  /** When true, plays fade-out animation before removal */
  fadeOut?: boolean;
}

export const TypingIndicator = memo(({ fadeOut }: TypingIndicatorProps) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 2px",
        animation: fadeOut
          ? "thinkingFadeOut 0.25s ease-out forwards"
          : "typingFadeInUp 0.3s ease-out",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: DOT_COLORS[i],
            animation: `thinkingDot 1.4s ease-in-out ${i * 0.2}s infinite`,
            boxShadow: "0 1px 4px rgba(139, 92, 246, 0.25)",
          }}
        />
      ))}
    </div>
  );
});

TypingIndicator.displayName = "TypingIndicator";
