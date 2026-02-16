import { memo, useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { toaster } from "@/components/ui/toaster";
import { ToolResultCard } from "./ToolResultCard";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];
const mdComponents = {
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

// Inject animation styles once
const STYLE_ID = "chat-bubble-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes bubbleFadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes streamingCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
    @keyframes bubbleCopyFlash { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.97); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
    .chat-copy-btn { opacity: 0; }
    .chat-bubble-wrap:hover .chat-copy-btn { opacity: 1; }
    .chat-copy-btn:hover { color: rgba(255,255,255,0.7) !important; background: rgba(255,255,255,0.08) !important; }
  `;
  document.head.appendChild(style);
}

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: string;
  staggerIndex?: number;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export const ChatBubble = memo(({ role, content, timestamp, isStreaming, isToolCall, toolName, toolStatus }: ChatBubbleProps) => {
  const { t } = useTranslation();
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const [flashing, setFlashing] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const handleDoubleClick = useCallback(() => {
    // Skip if user is selecting text
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    navigator.clipboard.writeText(content).then(() => {
      setFlashing(true);
      toaster.create({ title: t("chat.textCopied"), type: "success", duration: 1500 });
      setTimeout(() => setFlashing(false), 350);
    });
  }, [content, t]);

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
      <div style={{ maxWidth: "78%" }} className={!isUser ? "chat-bubble-wrap" : undefined}>
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
            {t("chat.characterName")}
          </span>
        )}
        <div style={{ position: "relative" }}>
          <div
            ref={bubbleRef}
            onDoubleClick={!isUser && !isStreaming && content ? handleDoubleClick : undefined}
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
              cursor: !isUser && !isStreaming && content ? "default" : undefined,
              animation: flashing ? "bubbleCopyFlash 0.35s ease-out" : undefined,
            }}
          >
            {isUser ? (
              <span
                style={{
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.95)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.7,
                  letterSpacing: "0.3px",
                }}
              >
                {content}
              </span>
            ) : (
              <div className="md-content" style={{ fontSize: "14px", color: "rgba(255,255,255,0.88)", lineHeight: 1.7, letterSpacing: "0.3px" }}>
                <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={mdComponents}>{content}</ReactMarkdown>
                {isStreaming && (
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
                )}
              </div>
            )}
          </div>
          {!isUser && !isStreaming && content && (
            <button
              onClick={handleCopy}
              className="chat-copy-btn"
              title={copied ? t("chat.copied") : t("chat.copy")}
              style={{
                position: "absolute",
                top: "6px",
                right: "-32px",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                padding: 0,
                color: copied ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.3)",
                transition: "all 0.2s ease",
              }}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>
          )}
        </div>
        {timestamp && (
          <span
            style={{
              display: "block",
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.25)",
              marginTop: "3px",
              textAlign: isUser ? "right" : "left",
              marginLeft: isUser ? undefined : "4px",
              marginRight: isUser ? "4px" : undefined,
            }}
          >
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
});

ChatBubble.displayName = "ChatBubble";
