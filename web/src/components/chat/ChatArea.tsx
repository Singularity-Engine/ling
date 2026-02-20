import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { ThinkingBubble } from "./ThinkingBubble";
import { TimeSeparator, shouldShowSeparator } from "./TimeSeparator";
import { useChatHistory } from "@/context/chat-history-context";

import { useAiState } from "@/context/ai-state-context";
import { useWebSocket } from "@/context/websocket-context";

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
    @keyframes emptyStateFadeOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-12px) scale(0.96); } }
    @keyframes scrollBtnIn { from { opacity: 0; transform: translateY(12px) scale(0.8); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes scrollBtnPulse { 0%, 100% { box-shadow: 0 2px 12px rgba(139, 92, 246, 0.3); } 50% { box-shadow: 0 2px 20px rgba(139, 92, 246, 0.5); } }
    @keyframes chipFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes greetingBubbleIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .welcome-chip { transition: all 0.2s ease; }
    .welcome-chip:hover { background: rgba(139, 92, 246, 0.25) !important; border-color: rgba(139, 92, 246, 0.35) !important; transform: translateY(-1px); }
    .welcome-chip:active { transform: scale(0.97); }
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

// Reusable suggestion chips strip
function SuggestionChips({
  chips,
  onChipClick,
  centered,
  baseDelay = 0,
}: {
  chips: string[];
  onChipClick: (text: string) => void;
  centered?: boolean;
  baseDelay?: number;
}) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: centered ? "center" : undefined,
        gap: "8px",
        maxWidth: "340px",
        ...(centered ? {} : { padding: "4px 16px 12px" }),
      }}
    >
      {chips.map((chip, i) => (
        <button
          key={chip}
          className="welcome-chip"
          onClick={() => onChipClick(chip)}
          style={{
            background: "rgba(139, 92, 246, 0.12)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            borderRadius: "20px",
            padding: "8px 16px",
            color: "rgba(226, 212, 255, 0.8)",
            fontSize: "13px",
            cursor: "pointer",
            animation: `chipFadeIn 0.4s ease-out ${baseDelay + i * 0.08}s both`,
            lineHeight: "1.4",
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export const ChatArea = memo(() => {
  const { messages, fullResponse, appendHumanMessage } = useChatHistory();
  const { isThinkingSpeaking } = useAiState();
  const { sendMessage, wsState } = useWebSocket();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Throttle the rapidly-updating fullResponse to ~display refresh rate
  const displayResponse = useThrottledValue(fullResponse);

  // Track empty-state exit animation: keep showing for 350ms with fade-out
  const [emptyExiting, setEmptyExiting] = useState(false);
  const prevEmptyRef = useRef(true);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  // Ref mirrors isNearBottom so the auto-scroll effect can read the latest
  // value without depending on it (avoids re-firing on scroll-position changes).
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isNearBottomRef.current = near;
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
    if (isNearBottomRef.current) {
      const el = bottomRef.current;
      if (!el) return;
      if (displayResponse.length > 0) {
        // Instant scroll during streaming — avoids "smooth" animation lag
        el.scrollIntoView({ behavior: "instant" });
      } else {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      setHasNewMessage(true);
    }
    // Only re-run when actual content changes, NOT on scroll-position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, displayResponse]);

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

  // Detect isEmpty going from true → false, trigger exit animation
  useEffect(() => {
    if (prevEmptyRef.current && !isEmpty) {
      setEmptyExiting(true);
      const timer = setTimeout(() => setEmptyExiting(false), 350);
      return () => clearTimeout(timer);
    }
    prevEmptyRef.current = isEmpty;
  }, [isEmpty]);

  // True when this is the first AI message (greeting bubble)
  const isGreeting = dedupedMessages.length === 1 && dedupedMessages[0].role === "ai";

  const welcomeChips = t("ui.welcomeChips", { returnObjects: true }) as string[];
  const postGreetingChips = t("ui.postGreetingChips", { returnObjects: true }) as string[];

  // Time-based welcome title
  const welcomeTitle = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t("ui.welcomeTitleMorning");
    if (hour >= 12 && hour < 18) return t("ui.welcomeTitleAfternoon");
    if (hour >= 18 && hour < 23) return t("ui.welcomeTitleEvening");
    return t("ui.welcomeTitle");
  }, [t]);

  const isConnected = wsState === "OPEN";

  const handleChipClick = useCallback(
    (text: string) => {
      if (!isConnected) return;
      appendHumanMessage(text);
      sendMessage({ type: "text-input", text, images: [] });
    },
    [appendHumanMessage, sendMessage, isConnected]
  );

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
      {(isEmpty || emptyExiting) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px 16px",
            gap: "20px",
            animation: emptyExiting
              ? "emptyStateFadeOut 0.35s ease-in forwards"
              : "chatFadeInUp 0.6s ease-out",
            pointerEvents: emptyExiting ? "none" : undefined,
            // During exit: overlay so incoming content isn't pushed below viewport
            ...(emptyExiting ? { position: "absolute" as const, inset: 0, zIndex: 10 } : {}),
          }}
        >
          <span
            style={{
              fontSize: "32px",
              animation: "emptyStateFloat 3s ease-in-out infinite",
            }}
          >
            ✦
          </span>

          {/* Glassmorphism welcome card */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "16px",
              padding: "20px 24px",
              maxWidth: "320px",
              width: "100%",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontSize: "15px",
                color: "rgba(226, 212, 255, 0.85)",
                fontWeight: 500,
                letterSpacing: "0.3px",
                lineHeight: "1.5",
              }}
            >
              {welcomeTitle}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "rgba(255, 255, 255, 0.25)",
              }}
            >
              {t("ui.emptySubHint")}
            </span>
          </div>

          {/* Suggestion chips */}
          <SuggestionChips chips={welcomeChips} onChipClick={handleChipClick} centered />
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
              isGreeting={i === 0 && msg.role === "ai" && isGreeting}
            />
          </div>
        );
      })}
      {/* Suggestion chips: stay visible after greeting until user sends first message */}
      {isGreeting && !emptyExiting && (
        <SuggestionChips chips={welcomeChips} onChipClick={handleChipClick} baseDelay={0.2} />
      )}

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
