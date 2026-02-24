import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Virtuoso } from "react-virtuoso";
import { ChatBubble } from "./ChatBubble";
import { TimeSeparator, shouldShowSeparator } from "./TimeSeparator";
import { SuggestionChips } from "./SuggestionChips";
import { StreamingFooter } from "./StreamingFooter";
import { useChatMessagesState, useChatMessagesActions, useStreamingRef } from "@/context/ChatHistoryContext";
import type { Message } from "@/services/websocket-service";

import { useAiStateRead } from "@/context/AiStateContext";
import { useWebSocketState, useWebSocketActions } from "@/context/WebsocketContext";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useSwipeCollapse } from "@/hooks/useSwipeCollapse";
import { focusTextarea } from "@/utils/dom";

// Touch-only device detection (no hover capability = phone/tablet)
const isTouchDevice =
  typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;

/**
 * Max messages to render to the DOM at once.
 * Older ones are hidden behind a "load more" button to prevent DOM bloat.
 * Messages beyond this window still exist in state (up to MAX_MESSAGES=200).
 */
const RENDER_WINDOW = 80;
const EMPTY_IMAGES: never[] = [];

// ─── Static style constants (avoid per-render allocation during ~30fps streaming) ───

const S_CONTAINER: CSSProperties = {
  maxHeight: "inherit",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "var(--ling-space-4) 0",
  position: "relative",
  overscrollBehavior: "contain",
};

const S_LOAD_MORE_WRAP: CSSProperties = {
  display: "flex", justifyContent: "center", padding: "var(--ling-space-2) 0 var(--ling-space-3)",
};

const S_LOAD_MORE_BTN: CSSProperties = {
  background: "var(--ling-surface)",
  border: "1px solid var(--ling-surface-hover)",
  borderRadius: "var(--ling-radius-lg)",
  padding: "var(--ling-radius-sm) var(--ling-space-4)",
  color: "var(--ling-text-secondary)",
  fontSize: "var(--ling-font-sm)",
  cursor: "pointer",
  transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), color var(--ling-duration-fast)`,
};

const S_SCROLL_WRAP: CSSProperties = {
  position: "sticky",
  bottom: "var(--ling-space-3)",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

const S_SCROLL_BTN: CSSProperties = {
  pointerEvents: "auto",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  background: "var(--ling-purple-85)",
  color: "var(--ling-text-primary)",
  fontSize: "var(--ling-font-lg)",
  lineHeight: 1,
  border: "1px solid var(--ling-purple-40)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 2px 12px var(--ling-purple-30)",
  cursor: "pointer",
  transition: `transform var(--ling-duration-fast), box-shadow var(--ling-duration-fast), background var(--ling-duration-fast)`,
  animation: "scrollBtnIn 0.25s var(--ling-ease-enter)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
};

const S_SCROLL_BTN_PULSE: CSSProperties = {
  ...S_SCROLL_BTN,
  boxShadow: "0 2px 20px var(--ling-purple-50)",
  animation: "scrollBtnIn 0.25s var(--ling-ease-enter), scrollBtnPulse 2s ease-in-out 0.3s infinite",
};

const S_NEW_DOT: CSSProperties = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "var(--ling-error)",
  border: "2px solid rgba(15, 15, 20, 0.9)",
  animation: "chatFadeInUp 0.2s ease-out",
};

// ─── Empty-state style constants ───

const S_EMPTY_WRAP: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "var(--ling-space-6) var(--ling-space-4)",
  gap: "var(--ling-space-5)",
};

const S_EMPTY_WRAP_EXIT: CSSProperties = {
  ...S_EMPTY_WRAP,
  animation: "emptyStateFadeOut 0.35s ease-in forwards",
  pointerEvents: "none",
  position: "absolute",
  inset: 0,
  zIndex: 10,
};

const S_EMPTY_GLYPH: CSSProperties = {
  fontSize: "var(--ling-font-display)",
  fontWeight: 700,
  color: "var(--ling-purple-light)",
  textShadow: "0 0 24px var(--ling-purple-40), 0 0 48px var(--ling-purple-15)",
  animation: "emptyItemFadeIn 0.5s ease-out both, emptyStateFloat 3s ease-in-out infinite",
  letterSpacing: "2px",
  userSelect: "none",
};

const S_WELCOME_CARD: CSSProperties = {
  background: "var(--ling-surface)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid var(--ling-surface-border)",
  borderRadius: "var(--ling-radius-lg)",
  padding: "18px 22px",
  maxWidth: "320px",
  width: "100%",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ling-space-2)",
  animation: "chatFadeInUp var(--ling-duration-slow) var(--ling-ease-enter) 0.2s both",
};

const S_WELCOME_TITLE: CSSProperties = {
  fontSize: "var(--ling-font-15)",
  color: "var(--ling-purple-text)",
  fontWeight: 500,
  letterSpacing: "0.3px",
  lineHeight: "1.5",
};

const S_WELCOME_SUB: CSSProperties = {
  fontSize: "var(--ling-font-sm)",
  color: "var(--ling-text-muted)",
};

const S_TAGLINE: CSSProperties = {
  fontSize: "var(--ling-font-13)",
  color: "var(--ling-text-muted)",
  letterSpacing: "1px",
  marginTop: "-14px",
  marginBottom: "-4px",
  animation: "chatFadeInUp var(--ling-duration-slow) var(--ling-ease-enter) 0.1s both",
};

const S_CAPS_ROW: CSSProperties = {
  display: "flex",
  gap: "var(--ling-space-2)",
  justifyContent: "center",
  flexWrap: "wrap",
  marginBottom: "calc(-1 * var(--ling-space-2))",
  animation: "chatFadeInUp var(--ling-duration-slow) var(--ling-ease-enter) 0.35s both",
};

const S_CAP_TAG: CSSProperties = {
  fontSize: "var(--ling-font-xs)",
  color: "var(--ling-purple-light)",
  background: "var(--ling-purple-15)",
  border: "1px solid var(--ling-purple-15)",
  borderRadius: "var(--ling-radius-md)",
  padding: "var(--ling-space-1) var(--ling-space-3)",
  letterSpacing: "0.3px",
};

const S_KEYBOARD_HINT: CSSProperties = {
  fontSize: "var(--ling-font-xs)",
  color: "var(--ling-text-muted)",
  letterSpacing: "0.3px",
  animation: "emptyHintFadeIn var(--ling-duration-slow) var(--ling-ease-enter) 0.55s both",
};

// ─── ChatArea ───

interface ChatAreaProps {
  /** Mobile only: callback to collapse the chat panel via swipe-down gesture */
  onCollapse?: () => void;
}

export const ChatArea = memo(({ onCollapse }: ChatAreaProps) => {
  const { messages } = useChatMessagesState();
  const { appendHumanMessage } = useChatMessagesActions();
  const { getFullResponse } = useStreamingRef();
  const { isThinkingSpeaking } = useAiStateRead();
  const { wsState } = useWebSocketState();
  const { sendMessage } = useWebSocketActions();
  const { t } = useTranslation();

  const {
    scrollRef, bottomRef, scrollParent,
    isNearBottom, hasNewMessage, isNearBottomRef,
    scrollToBottom,
  } = useChatScroll(messages, getFullResponse);

  // Swipe-to-collapse gesture (mobile only)
  const collapseNoop = useCallback(() => {}, []);
  const { showPill, dragOffset, isDragging, handlers: swipeHandlers } = useSwipeCollapse({
    scrollRef,
    onCollapse: onCollapse ?? collapseNoop,
    enabled: !!onCollapse && isTouchDevice,
  });

  // Track empty-state exit animation: keep showing for 350ms with fade-out
  const [emptyExiting, setEmptyExiting] = useState(false);
  const prevEmptyRef = useRef(true);

  // true during the render immediately after streaming ends — lets us skip
  // the entry animation on the just-committed AI bubble (avoids a blink).
  const wasStreamingRef = useRef(false);

  const isConnected = wsState === "OPEN";
  // Ref mirror — keeps handleChipClick stable across connection state changes
  // so SuggestionChips memo isn't invalidated on every connect/disconnect.
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  // Focus-timer ref — cleared on unmount to avoid DOM ops after teardown.
  const focusTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(focusTimerRef.current); }, []);

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
  // Ref mirrors let the Virtuoso itemContent callback read the latest values
  // without depending on them, keeping the callback reference fully stable.
  // This prevents Virtuoso from re-invoking itemContent for all visible items
  // (~15-20) on every new message once the conversation exceeds RENDER_WINDOW.
  const dedupedRef = useRef(dedupedMessages);
  dedupedRef.current = dedupedMessages;

  const isEmpty = dedupedMessages.length === 0 && !isThinkingSpeaking;

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

  // Randomized once on mount — useState lazy initializers are stable across
  // StrictMode double-invocations and won't reshuffle on re-render.
  const [welcomeChips] = useState(() => {
    const pool = t("ui.welcomeChips", { returnObjects: true }) as string[];
    if (!Array.isArray(pool) || pool.length <= 4) return pool;
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4);
  });
  const postGreetingChips = useMemo(() => t("ui.postGreetingChips", { returnObjects: true }) as string[], [t]);

  // Randomized subtitle hint — stable across re-renders
  const [welcomeSub] = useState(() => {
    const pool = t("ui.emptySubHints", { returnObjects: true }) as string[];
    if (!Array.isArray(pool) || pool.length === 0) return t("ui.emptySubHint");
    return pool[Math.floor(Math.random() * pool.length)];
  });

  // Time-based welcome title
  const welcomeTitle = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t("ui.welcomeTitleMorning");
    if (hour >= 12 && hour < 18) return t("ui.welcomeTitleAfternoon");
    if (hour >= 18 && hour < 23) return t("ui.welcomeTitleEvening");
    return t("ui.welcomeTitle");
  }, [t]);

  const handleChipClick = useCallback(
    (text: string) => {
      if (!isConnectedRef.current) return;
      appendHumanMessage(text);
      sendMessage({ type: "text-input", text, images: EMPTY_IMAGES });
      // Focus textarea so the user is ready to type when AI responds
      focusTimerRef.current = setTimeout(focusTextarea, 0);
    },
    [appendHumanMessage, sendMessage]
  );

  // ── Render windowing: only mount the last RENDER_WINDOW messages ──
  // Keeps the DOM small in long conversations while all messages remain in state.
  // Progressive loading: each "Load more" click reveals another batch instead
  // of dumping all hidden messages into the DOM at once (which causes jank).
  const [extraBatches, setExtraBatches] = useState(0);
  const renderLimit = RENDER_WINDOW + extraBatches * RENDER_WINDOW;
  const hiddenCount = Math.max(0, dedupedMessages.length - renderLimit);
  // Memoize so the reference stays stable during streaming (~30fps re-renders).
  // Without this, .slice() creates a new array every frame when >80 messages,
  // invalidating the messageElements useMemo below.
  const visibleMessages = useMemo(
    () => hiddenCount > 0 ? dedupedMessages.slice(hiddenCount) : dedupedMessages,
    [dedupedMessages, hiddenCount],
  );

  // Preserve scroll position when revealing older messages
  const handleLoadMore = useCallback(() => {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setExtraBatches((n) => n + 1);
    // After React commits the new DOM, adjust scrollTop so the viewport
    // stays on the same message the user was looking at.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevHeight;
    });
  }, []);

  // Reset windowing when conversation is cleared (new session)
  useEffect(() => {
    if (dedupedMessages.length <= RENDER_WINDOW) setExtraBatches(0);
  }, [dedupedMessages.length]);

  // Ref mirrors for values used inside itemContent — reading from refs keeps
  // the callback reference fully stable, preventing Virtuoso from re-invoking
  // itemContent for all ~15-20 visible items whenever hiddenCount/isGreeting change.
  const hiddenCountRef = useRef(hiddenCount);
  hiddenCountRef.current = hiddenCount;
  const isGreetingRef = useRef(isGreeting);
  isGreetingRef.current = isGreeting;

  // Virtuoso item renderer — only called for visible items (~15-20 in viewport + overscan).
  // Reads all mutable values via refs so the callback stays referentially stable;
  // Virtuoso can then skip re-invoking it for existing visible items.
  // Stable key extractor — avoids creating a new function reference on each
  // streaming frame (~30fps) which would force Virtuoso to re-reconcile all items.
  const computeItemKey = useCallback((_: number, msg: Message) => msg.id, []);

  const itemContent = useCallback(
    (index: number, msg: Message) => {
      const allMsgs = dedupedRef.current;
      const origIdx = index + hiddenCountRef.current;
      const prev = allMsgs[origIdx - 1];
      const showSep =
        prev &&
        msg.timestamp &&
        prev.timestamp &&
        shouldShowSeparator(prev.timestamp, msg.timestamp);
      const isLastAi =
        origIdx === allMsgs.length - 1 &&
        msg.role === "ai" &&
        msg.type !== "tool_call_status";
      const senderChanged = prev && ((msg.role === "human") !== (prev.role === "human"));
      return (
        <div className="chat-msg-item">
          {showSep && <TimeSeparator timestamp={msg.timestamp} />}
          <ChatBubble
            role={msg.role === "human" ? "user" : "assistant"}
            content={msg.content}
            timestamp={msg.timestamp}
            isToolCall={msg.type === "tool_call_status"}
            toolName={msg.tool_name}
            toolStatus={msg.status}
            isGreeting={origIdx === 0 && msg.role === "ai" && isGreetingRef.current}
            skipEntryAnimation={
              (isLastAi && wasStreamingRef.current) || undefined
            }
            senderChanged={senderChanged || undefined}
          />
        </div>
      );
    },
    // Fully stable: all mutable values read via refs (dedupedRef, hiddenCountRef,
    // isGreetingRef, wasStreamingRef). This is critical for 80+ message conversations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div
      ref={scrollRef}
      className="chat-area-scroll"
      role="log"
      aria-label={t("ui.chatMessages")}
      aria-live="polite"
      style={isDragging ? { ...S_CONTAINER, transform: `translateY(${dragOffset}px)` } : dragOffset === 0 ? S_CONTAINER : { ...S_CONTAINER, transform: "translateY(0)", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      {...swipeHandlers}
    >
      {/* Swipe pill indicator */}
      {showPill && (
        <div className="ling-swipe-pill" role="button" aria-label={t("ui.collapseSwipe", "Collapse chat panel")} tabIndex={-1} />
      )}
      {(isEmpty || emptyExiting) && (
        <div style={emptyExiting ? S_EMPTY_WRAP_EXIT : S_EMPTY_WRAP}>
          <span style={S_EMPTY_GLYPH}>{t("loading.glyph")}</span>
          <span style={S_TAGLINE}>{t("ui.emptyTagline")}</span>

          {/* Glassmorphism welcome card */}
          <div className="ling-welcome-card" style={S_WELCOME_CARD}>
            <span style={S_WELCOME_TITLE}>{welcomeTitle}</span>
            <span style={S_WELCOME_SUB}>
              {isConnected ? welcomeSub : t("ui.emptySubHintDisconnected")}
            </span>
          </div>

          {/* Capability tags */}
          {isConnected && (
            <div style={S_CAPS_ROW}>
              <span style={S_CAP_TAG}>{t("ui.capMemory")}</span>
              <span style={S_CAP_TAG}>{t("ui.capVoice")}</span>
              <span style={S_CAP_TAG}>{t("ui.capAvatar")}</span>
            </div>
          )}

          {/* Suggestion chips — hidden while disconnected */}
          {isConnected && (
            <SuggestionChips chips={welcomeChips} onChipClick={handleChipClick} centered baseDelay={0.45} />
          )}

          {/* Interaction hint — keyboard for pointer devices, tap hint for touch */}
          {isConnected && (
            <span style={S_KEYBOARD_HINT}>
              {isTouchDevice ? t("ui.emptyTouchHint") : t("ui.emptyKeyboardHint")}
            </span>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <div style={S_LOAD_MORE_WRAP}>
          <button className="ling-load-more" onClick={handleLoadMore} style={S_LOAD_MORE_BTN}>
            {t("chat.loadOlder", { count: hiddenCount })}
          </button>
        </div>
      )}
      {scrollParent && (
        <Virtuoso
          customScrollParent={scrollParent}
          data={visibleMessages}
          defaultItemHeight={64}
          increaseViewportBy={400}
          computeItemKey={computeItemKey}
          itemContent={itemContent}
        />
      )}
      {/* Suggestion chips: stay visible after greeting until user sends first message */}
      {isGreeting && !emptyExiting && (
        <SuggestionChips chips={postGreetingChips} onChipClick={handleChipClick} baseDelay={0.2} />
      )}

      <StreamingFooter
        scrollRef={scrollRef}
        isNearBottomRef={isNearBottomRef}
        wasStreamingRef={wasStreamingRef}
        dedupedMessages={dedupedMessages}
      />

      <div ref={bottomRef} />

      {!isNearBottom && (
        <div style={S_SCROLL_WRAP}>
          <button
            className="ling-scroll-btn"
            onClick={scrollToBottom}
            aria-label={t("ui.scrollToLatest")}
            style={hasNewMessage ? S_SCROLL_BTN_PULSE : S_SCROLL_BTN}
          >
            ↓
            {hasNewMessage && <span style={S_NEW_DOT} />}
          </button>
        </div>
      )}
    </div>
  );
});

ChatArea.displayName = "ChatArea";
