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
  display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: "8px",
  marginBottom: "14px", padding: "0 16px", animation: "thinkingBubbleIn 0.3s ease-out",
};
const S_AVATAR_AI: CSSProperties = {
  width: "28px", height: "28px", borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "13px", fontWeight: 600, flexShrink: 0,
  letterSpacing: "0.3px", userSelect: "none", marginTop: "1px",
  background: "var(--ling-avatar-ai-bg)", color: "var(--ling-avatar-ai-color)",
};
const S_INNER: CSSProperties = { maxWidth: "78%", minWidth: 0 };
const S_NAME: CSSProperties = {
  display: "block", fontSize: "11px", color: "var(--ling-chat-label)",
  marginBottom: "4px", marginLeft: "4px", fontWeight: 500, letterSpacing: "0.5px",
};
const S_BUBBLE: CSSProperties = {
  padding: "12px 18px", borderRadius: "18px 18px 18px 2px",
  background: "var(--ling-bubble-ai-bg)", border: "1px solid var(--ling-bubble-ai-border)",
  borderLeft: "3px solid var(--ling-bubble-ai-accent)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 1px 8px var(--ling-bubble-ai-shadow)",
  transition: "box-shadow 0.2s ease, background 0.2s ease",
  overflow: "hidden", minHeight: "20px", position: "relative",
};
const S_MD: CSSProperties = { fontSize: "14px", color: "var(--ling-bubble-ai-text)", lineHeight: 1.7, letterSpacing: "0.3px" };
const S_MD_FADE: CSSProperties = { ...S_MD, animation: "textFadeIn 0.3s ease-out" };
const S_CURSOR: CSSProperties = {
  display: "inline-block", width: "2px", height: "14px", background: "var(--ling-purple)",
  marginLeft: "2px", verticalAlign: "text-bottom", borderRadius: "1px",
  animation: "streamingCursor 1s ease-in-out infinite",
};

/**
 * Coarser throttle: caps ReactMarkdown re-parses at ~8fps (125ms interval)
 * during streaming.  Between ticks the component still re-renders (props
 * change at ~30fps) but the useMemo keyed on mdContent returns cached VDOM
 * — essentially free reconciliation.
 * Outside streaming the value passes through immediately.
 */
function useMdThrottle(content: string, active: boolean): string {
  const [snap, setSnap] = useState(content);
  const ref = useRef(content);
  ref.current = content;

  useEffect(() => {
    if (!active) { setSnap(ref.current); return; }
    setSnap(ref.current);                       // flush on activation
    const id = setInterval(() => setSnap(ref.current), 125);
    return () => clearInterval(id);
  }, [active]);

  // When deactivated, pass through content changes immediately
  useEffect(() => { if (!active) setSnap(content); }, [active, content]);

  return snap;
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

  // Throttle markdown re-parse: ~8fps during streaming instead of ~30fps.
  // Also skip rehype-highlight — syntax coloring is expensive and the final
  // ChatBubble render applies it once the message is committed.
  const mdContent = useMdThrottle(content, isStreaming);

  const renderedMarkdown = useMemo(
    () => <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>{mdContent}</ReactMarkdown>,
    [mdContent]
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

  const aiInitial = t("chat.characterName").charAt(0);

  return (
    <div className="ling-msg-row" style={S_OUTER}>
      <div className="ling-avatar" style={S_AVATAR_AI}>{aiInitial}</div>
      <div style={S_INNER} className="chat-msg-inner">
        <span style={S_NAME}>{t("chat.characterName")}</span>
        <div style={S_BUBBLE}>
          {(isThinking || showDotsExit) && (
            <TypingIndicator fadeOut={showDotsExit} />
          )}
          {isStreaming && mdContent && (
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
