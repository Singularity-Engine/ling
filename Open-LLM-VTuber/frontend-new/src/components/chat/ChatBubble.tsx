import { memo } from "react";
import { ToolResultCard } from "./ToolResultCard";

// Inject animation styles once
const STYLE_ID = "chat-bubble-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes bubbleFadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bubblePulse { 0%, 100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
  `;
  document.head.appendChild(style);
}

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: string;
}

export const ChatBubble = memo(({ role, content, isStreaming, isToolCall, toolName, toolStatus }: ChatBubbleProps) => {
  const isUser = role === "user";

  if (isToolCall && toolName) {
    return (
      <div style={{ padding: "0 16px", marginBottom: "10px", maxWidth: "90%" }}>
        <ToolResultCard toolName={toolName} content={content} status={toolStatus || "running"} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
        padding: "0 16px",
        animation: "bubbleFadeInUp 0.3s ease-out",
      }}
    >
      <div style={{ maxWidth: "78%" }}>
        {!isUser && (
          <span
            style={{
              display: "block",
              fontSize: "11px",
              color: "rgba(139, 92, 246, 0.6)",
              marginBottom: "4px",
              marginLeft: "4px",
              fontWeight: 500,
              letterSpacing: "0.5px",
            }}
          >
            灵
          </span>
        )}
        <div
          style={{
            padding: "10px 16px",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            background: isUser
              ? "linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(109, 40, 217, 0.25))"
              : "rgba(255, 255, 255, 0.06)",
            border: isUser ? "1px solid rgba(139, 92, 246, 0.25)" : "1px solid rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            transition: "all 0.2s ease",
            boxShadow: isUser
              ? "0 2px 12px rgba(139, 92, 246, 0.15)"
              : "0 1px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              color: isUser ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.88)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              letterSpacing: "0.3px",
            }}
          >
            {content}
            {isStreaming && (
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#8b5cf6",
                  marginLeft: "4px",
                  verticalAlign: "middle",
                  animation: "bubblePulse 1.2s ease-in-out infinite",
                }}
              />
            )}
          </span>
        </div>
      </div>
    </div>
  );
});

ChatBubble.displayName = "ChatBubble";
