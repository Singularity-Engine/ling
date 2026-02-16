import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { ThinkingBubble } from "./ThinkingBubble";
import { TimeSeparator, shouldShowSeparator } from "./TimeSeparator";
import { useChatHistory } from "@/context/chat-history-context";
import { useSubtitle } from "@/context/subtitle-context";
import { useAiState } from "@/context/ai-state-context";

// Inject scrollbar + animation styles once
const STYLE_ID = "chat-area-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .chat-area-scroll::-webkit-scrollbar { width: 4px; }
    .chat-area-scroll::-webkit-scrollbar-track { background: transparent; }
    .chat-area-scroll::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.3); border-radius: 2px; }
    @keyframes chatFadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes emptyStateFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes scrollBtnIn { from { opacity: 0; transform: translateY(12px) scale(0.8); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes scrollBtnPulse { 0%, 100% { box-shadow: 0 2px 12px rgba(139, 92, 246, 0.3); } 50% { box-shadow: 0 2px 20px rgba(139, 92, 246, 0.5); } }
  `;
  document.head.appendChild(style);
}

/**
 * Hook: throttle a rapidly-changing string to ~30 fps using rAF.
 * Returns the latest snapshot that the render loop should display.
 * When the source becomes empty the hook returns "" immediately (no delay).
 */
function useThrottledValue(source: string): string {
  const [display, setDisplay] = useState(source);
  const rafRef = useRef(0);
  const latestRef = useRef(source);

  latestRef.current = source;

  useEffect(() => {
    // Fast path: source cleared → flush immediately
    if (source === '') {
      setDisplay('');
      return;
    }

    // Schedule an rAF to batch rapid updates
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setDisplay(latestRef.current);
      });
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [source]);

  return display;
}

export const ChatArea = memo(() => {
  const { messages, fullResponse } = useChatHistory();
  const { subtitleText } = useSubtitle();
  const { isThinkingSpeaking } = useAiState();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Throttle the rapidly-updating fullResponse to ~display refresh rate
  const displayResponse = useThrottledValue(fullResponse);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsNearBottom(near);
    if (near) setHasNewMessage(false);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkNearBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkNearBottom);
  }, [checkNearBottom]);

  // During active streaming use instant scroll to keep up with rapid updates;
  // for normal new messages use smooth scroll.
  const isStreaming = displayResponse.length > 0;

  useEffect(() => {
    if (isNearBottom) {
      const el = bottomRef.current;
      if (!el) return;
      if (isStreaming) {
        // Instant scroll during streaming — avoids "smooth" animation lag
        el.scrollIntoView({ behavior: "instant" });
      } else {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      setHasNewMessage(true);
    }
  }, [messages, displayResponse, subtitleText, isNearBottom, isStreaming]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  }, []);

  const showTyping = isThinkingSpeaking && !isStreaming;

  // Memoize dedup so it only recalculates when messages change, not on every streaming delta
  const dedupedMessages = useMemo(
    () =>
      messages.filter((msg, index, arr) => {
        if (index === 0) return true;
        const prev = arr[index - 1];
        return !(prev.role === msg.role && prev.content === msg.content);
      }),
    [messages]
  );

  const showStreaming = useMemo(() => {
    if (!isStreaming) return false;
    const lastAiMsg = dedupedMessages.findLast(m => m.role === 'ai');
    return !(lastAiMsg && lastAiMsg.content && displayResponse.startsWith(lastAiMsg.content));
  }, [isStreaming, dedupedMessages, displayResponse]);

  const isEmpty = dedupedMessages.length === 0 && !showStreaming && !showTyping;

  return (
    <div
      ref={scrollRef}
      className="chat-area-scroll"
      role="log"
      aria-label={t("ui.chatMessages")}
      aria-live="polite"
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "12px 0",
        position: "relative",
      }}
    >
      {isEmpty && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px 16px",
            gap: "14px",
            animation: "chatFadeInUp 0.6s ease-out",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              animation: "emptyStateFloat 3s ease-in-out infinite",
            }}
          >
            ✦
          </span>
          <span
            style={{
              fontSize: "14px",
              color: "rgba(226, 212, 255, 0.6)",
              textAlign: "center",
              letterSpacing: "0.3px",
              lineHeight: "1.6",
            }}
          >
            {t("ui.emptyHint")}
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "rgba(255, 255, 255, 0.2)",
              textAlign: "center",
            }}
          >
            {t("ui.emptySubHint")}
          </span>
        </div>
      )}
      {dedupedMessages.map((msg, i) => {
        const prev = dedupedMessages[i - 1];
        const showSep = prev && msg.timestamp && prev.timestamp && shouldShowSeparator(prev.timestamp, msg.timestamp);
        return (
          <div key={msg.id}>
            {showSep && <TimeSeparator timestamp={msg.timestamp} />}
            <ChatBubble
              role={msg.role === "human" ? "user" : "assistant"}
              content={msg.content}
              timestamp={msg.timestamp}
              isToolCall={msg.type === "tool_call_status"}
              toolName={msg.tool_name}
              toolStatus={msg.status}
            />
          </div>
        );
      })}
      {(showStreaming || showTyping) && (
        <ThinkingBubble
          content={displayResponse}
          isThinking={showTyping}
          isStreaming={showStreaming}
        />
      )}

      <div ref={bottomRef} />

      {!isNearBottom && (
        <div
          style={{
            position: "sticky",
            bottom: "12px",
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <button
            onClick={scrollToBottom}
            aria-label={t("ui.scrollToLatest")}
            style={{
              pointerEvents: "auto",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.85)",
              color: "rgba(255,255,255,0.95)",
              fontSize: "16px",
              lineHeight: 1,
              border: "1px solid rgba(139, 92, 246, 0.4)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.3)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              animation: hasNewMessage
                ? "scrollBtnIn 0.25s ease-out, scrollBtnPulse 2s ease-in-out infinite"
                : "scrollBtnIn 0.25s ease-out",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            ↓
            {hasNewMessage && (
              <span
                style={{
                  position: "absolute",
                  top: "-2px",
                  right: "-2px",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#ef4444",
                  border: "2px solid rgba(15, 15, 20, 0.9)",
                  animation: "chatFadeInUp 0.2s ease-out",
                }}
              />
            )}
          </button>
        </div>
      )}
    </div>
  );
});

ChatArea.displayName = "ChatArea";
