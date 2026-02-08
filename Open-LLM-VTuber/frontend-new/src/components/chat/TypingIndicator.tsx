import { memo } from "react";

// Inject animation styles once
const STYLE_ID = "typing-indicator-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes typingFadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes typingDot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }
  `;
  document.head.appendChild(style);
}

export const TypingIndicator = memo(() => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: "12px",
        padding: "0 16px",
        animation: "typingFadeInUp 0.3s ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "12px 18px",
          borderRadius: "18px 18px 18px 4px",
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.7)",
              animation: `typingDot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
});

TypingIndicator.displayName = "TypingIndicator";
