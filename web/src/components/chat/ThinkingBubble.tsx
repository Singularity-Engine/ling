import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { TypingIndicator } from "./TypingIndicator";

// Inject transition styles once
const STYLE_ID = "thinking-bubble-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes thinkingBubbleIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes textFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

interface ThinkingBubbleProps {
  content: string;
  isThinking: boolean;
  isStreaming: boolean;
}

export const ThinkingBubble = memo(({ content, isThinking, isStreaming }: ThinkingBubbleProps) => {
  const { t } = useTranslation();

  // Track whether we just transitioned from thinking to streaming
  // so we can play the dots fade-out animation
  const wasThinkingRef = useRef(false);
  const [showDotsExit, setShowDotsExit] = useState(false);

  useEffect(() => {
    if (isThinking) {
      wasThinkingRef.current = true;
    } else if (wasThinkingRef.current && isStreaming) {
      // Transition: thinking → streaming
      setShowDotsExit(true);
      wasThinkingRef.current = false;
      const timer = setTimeout(() => setShowDotsExit(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isThinking, isStreaming]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: "12px",
        padding: "0 16px",
        animation: "thinkingBubbleIn 0.3s ease-out",
      }}
    >
      <div style={{ maxWidth: "78%", minWidth: 0 }}>
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
          {t("chat.characterName")}
        </span>
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "18px 18px 18px 4px",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 1px 8px rgba(0, 0, 0, 0.1)",
            transition: "box-shadow 0.2s ease, background 0.2s ease",
            minHeight: "20px",
            position: "relative",
          }}
        >
          {/* Thinking dots — visible when thinking, fading out on transition */}
          {(isThinking || showDotsExit) && (
            <TypingIndicator fadeOut={showDotsExit} />
          )}

          {/* Streaming text — fades in when content arrives */}
          {isStreaming && content && (
            <div
              className="md-content"
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.7,
                letterSpacing: "0.3px",
                animation: showDotsExit ? "textFadeIn 0.3s ease-out" : undefined,
              }}
            >
              <ReactMarkdown>{content}</ReactMarkdown>
              <span
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "14px",
                  background: "#8b5cf6",
                  marginLeft: "2px",
                  verticalAlign: "text-bottom",
                  borderRadius: "1px",
                  animation: "streamingCursor 1s ease-in-out infinite",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ThinkingBubble.displayName = "ThinkingBubble";
