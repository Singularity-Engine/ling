import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { TypingIndicator } from "./TypingIndicator";
import { remarkPlugins, mdComponents } from "./ChatBubble";

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

// ─── Static style constants (avoid per-render allocation during ~60fps streaming) ───

const S_OUTER: CSSProperties = {
  display: "flex", justifyContent: "flex-start", marginBottom: "12px",
  padding: "0 16px", animation: "thinkingBubbleIn 0.3s ease-out",
};
const S_INNER: CSSProperties = { maxWidth: "78%", minWidth: 0 };
const S_NAME: CSSProperties = {
  display: "block", fontSize: "11px", color: "rgba(139, 92, 246, 0.6)",
  marginBottom: "4px", marginLeft: "4px", fontWeight: 500, letterSpacing: "0.5px",
};
const S_BUBBLE: CSSProperties = {
  padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
  background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 1px 8px rgba(0, 0, 0, 0.1)",
  transition: "box-shadow 0.2s ease, background 0.2s ease",
  overflow: "hidden", minHeight: "20px", position: "relative",
};
const S_MD: CSSProperties = { fontSize: "14px", color: "rgba(255,255,255,0.88)", lineHeight: 1.7, letterSpacing: "0.3px" };
const S_MD_FADE: CSSProperties = { ...S_MD, animation: "textFadeIn 0.3s ease-out" };
const S_CURSOR: CSSProperties = {
  display: "inline-block", width: "2px", height: "14px", background: "#8b5cf6",
  marginLeft: "2px", verticalAlign: "text-bottom", borderRadius: "1px",
  animation: "streamingCursor 1s ease-in-out infinite",
};

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

  // Memoize markdown rendering — avoids re-parsing when only isThinking/showDotsExit change
  const renderedMarkdown = useMemo(
    () => <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>{content}</ReactMarkdown>,
    [content]
  );

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
    <div style={S_OUTER}>
      <div style={S_INNER}>
        <span style={S_NAME}>{t("chat.characterName")}</span>
        <div style={S_BUBBLE}>
          {(isThinking || showDotsExit) && (
            <TypingIndicator fadeOut={showDotsExit} />
          )}
          {isStreaming && content && (
            <div className="md-content" style={showDotsExit ? S_MD_FADE : S_MD}>
              {renderedMarkdown}
              <span style={S_CURSOR} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ThinkingBubble.displayName = "ThinkingBubble";
