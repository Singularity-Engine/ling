import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ChatBubble } from "./ChatBubble";
import { ThinkingBubble } from "./ThinkingBubble";
import { TimeSeparator, shouldShowSeparator } from "./TimeSeparator";
import { useChatMessages, useStreamingValue, useStreamingRef } from "@/context/chat-history-context";
import type { Message } from "@/services/websocket-service";

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
    .welcome-chip { transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease; }
    .welcome-chip:hover { background: rgba(139, 92, 246, 0.25) !important; border-color: rgba(139, 92, 246, 0.35) !important; transform: translateY(-1px); }
    .welcome-chip:active { transform: scale(0.97); }
    .chat-msg-item { content-visibility: auto; contain-intrinsic-size: auto 80px; }
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
    // Fast path: source cleared → flush immediately & cancel pending rAF
    if (source === '') {
      setDisplay('');
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    // Only schedule if no rAF is pending — avoids cancel+reschedule on every
    // token during streaming.  The rAF reads latestRef so it always gets the
    // most recent value even if many source updates arrive within one frame.
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setDisplay(latestRef.current);
      });
    }
    // No per-change cleanup: let the scheduled rAF naturally coalesce rapid updates.
  }, [source]);

  // Cancel pending rAF only on unmount.
  useEffect(() => () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  return display;
}

// ─── SuggestionChips style constants (avoid per-render allocation) ───

const S_CHIPS_CENTERED: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "8px",
  maxWidth: "340px",
};

const S_CHIPS_LEFT: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  maxWidth: "340px",
  padding: "4px 16px 12px",
};

const S_CHIP_BASE: CSSProperties = {
  background: "rgba(139, 92, 246, 0.18)",
  border: "1px solid rgba(139, 92, 246, 0.28)",
  borderRadius: "20px",
  padding: "8px 16px",
  color: "rgba(226, 212, 255, 0.8)",
  fontSize: "13px",
  cursor: "pointer",
  lineHeight: "1.4",
};

// Lazily-cached chip styles keyed by "baseDelay:index" — avoids spreading
// S_CHIP_BASE + computing animation on every SuggestionChips render.
const _chipCache = new Map<string, CSSProperties>();
function getChipStyle(baseDelay: number, index: number): CSSProperties {
  const key = `${baseDelay}:${index}`;
  let s = _chipCache.get(key);
  if (!s) {
    s = { ...S_CHIP_BASE, animation: `chipFadeIn 0.4s ease-out ${baseDelay + index * 0.08}s both` };
    _chipCache.set(key, s);
  }
  return s;
}

// Reusable suggestion chips strip
const SuggestionChips = memo(function SuggestionChips({
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
    <div style={centered ? S_CHIPS_CENTERED : S_CHIPS_LEFT}>
      {chips.map((chip, i) => (
        <button
          key={chip}
          className="welcome-chip"
          onClick={() => onChipClick(chip)}
          style={getChipStyle(baseDelay, i)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
});
SuggestionChips.displayName = "SuggestionChips";

/**
 * Max messages to render to the DOM at once.
 * Older ones are hidden behind a "load more" button to prevent DOM bloat.
 * Messages beyond this window still exist in state (up to MAX_MESSAGES=200).
 */
const RENDER_WINDOW = 80;

// ─── Static style constants (avoid per-render allocation during ~30fps streaming) ───

const S_CONTAINER: CSSProperties = {
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "12px 0",
  position: "relative",
};

const S_LOAD_MORE_WRAP: CSSProperties = {
  display: "flex", justifyContent: "center", padding: "8px 0 12px",
};

const S_LOAD_MORE_BTN: CSSProperties = {
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "16px",
  padding: "6px 16px",
  color: "rgba(255, 255, 255, 0.5)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const S_SCROLL_WRAP: CSSProperties = {
  position: "sticky",
  bottom: "12px",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

const S_SCROLL_BTN: CSSProperties = {
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
  animation: "scrollBtnIn 0.25s ease-out",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
};

const S_SCROLL_BTN_PULSE: CSSProperties = {
  ...S_SCROLL_BTN,
  animation: "scrollBtnIn 0.25s ease-out, scrollBtnPulse 2s ease-in-out infinite",
};

const S_NEW_DOT: CSSProperties = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#ef4444",
  border: "2px solid rgba(15, 15, 20, 0.9)",
  animation: "chatFadeInUp 0.2s ease-out",
};

const S_TIMEOUT_WRAP: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 16px 12px",
  gap: "8px",
  animation: "chatFadeInUp 0.3s ease-out",
};

const S_TIMEOUT_TEXT: CSSProperties = {
  fontSize: "12px",
  color: "rgba(255, 255, 255, 0.35)",
  textAlign: "center",
  lineHeight: 1.5,
};

const S_RETRY_BTN: CSSProperties = {
  background: "rgba(139, 92, 246, 0.15)",
  border: "1px solid rgba(139, 92, 246, 0.3)",
  borderRadius: "14px",
  padding: "5px 16px",
  color: "rgba(167, 139, 250, 0.85)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

// ─── Empty-state style constants ───

const _S_EMPTY_BASE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "24px 16px",
  gap: "20px",
};

const S_EMPTY_WRAP: CSSProperties = {
  ..._S_EMPTY_BASE,
  animation: "chatFadeInUp 0.6s ease-out",
};

const S_EMPTY_WRAP_EXIT: CSSProperties = {
  ..._S_EMPTY_BASE,
  animation: "emptyStateFadeOut 0.35s ease-in forwards",
  pointerEvents: "none",
  position: "absolute",
  inset: 0,
  zIndex: 10,
};

const S_EMPTY_ICON: CSSProperties = {
  fontSize: "32px",
  animation: "emptyStateFloat 3s ease-in-out infinite",
};

const S_WELCOME_CARD: CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: "16px",
  padding: "20px 24px",
  maxWidth: "320px",
  width: "100%",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const S_WELCOME_TITLE: CSSProperties = {
  fontSize: "15px",
  color: "rgba(226, 212, 255, 0.85)",
  fontWeight: 500,
  letterSpacing: "0.3px",
  lineHeight: "1.5",
};

const S_WELCOME_SUB: CSSProperties = {
  fontSize: "12px",
  color: "rgba(255, 255, 255, 0.25)",
};

// ─── StreamingFooter: owns streaming subscription so ChatArea avoids ~30fps re-renders ───

interface StreamingFooterProps {
  scrollRef: { current: HTMLDivElement | null };
  isNearBottomRef: { current: boolean };
  wasStreamingRef: { current: boolean };
  dedupedMessages: Message[];
}

const StreamingFooter = memo(function StreamingFooter({
  scrollRef,
  isNearBottomRef,
  wasStreamingRef,
  dedupedMessages,
}: StreamingFooterProps) {
  const { fullResponse } = useStreamingValue();
  const { isThinkingSpeaking } = useAiState();
  const { sendMessage, wsState } = useWebSocket();
  const { t } = useTranslation();

  const displayResponse = useThrottledValue(fullResponse);
  const isStreaming = displayResponse.length > 0;
  const isConnected = wsState === "OPEN";

  const showStreaming = useMemo(() => {
    if (!isStreaming) return false;
    const lastAiMsg = dedupedMessages.findLast(m => m.role === 'ai');
    return !(lastAiMsg && lastAiMsg.content && displayResponse === lastAiMsg.content);
  }, [isStreaming, dedupedMessages, displayResponse]);

  // Mirror into parent ref so ChatArea's itemContent can read it for skipEntryAnimation
  useEffect(() => { wasStreamingRef.current = showStreaming; }, [showStreaming, wasStreamingRef]);

  const awaitingReply = useMemo(() => {
    if (isThinkingSpeaking || isStreaming || !isConnected) return false;
    const lastMsg = dedupedMessages[dedupedMessages.length - 1];
    return lastMsg?.role === "human";
  }, [dedupedMessages, isThinkingSpeaking, isStreaming, isConnected]);

  const [awaitingTimedOut, setAwaitingTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (!awaitingReply) {
      setAwaitingTimedOut(false);
      return;
    }
    setAwaitingTimedOut(false);
    const timer = setTimeout(() => setAwaitingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [awaitingReply, dedupedMessages.length, retryCount]);

  const showTyping = (isThinkingSpeaking || (awaitingReply && !awaitingTimedOut)) && !isStreaming;

  // Streaming auto-scroll: keep viewport pinned to bottom during rapid updates
  useEffect(() => {
    if (!displayResponse) return;
    if (!isNearBottomRef.current) return;
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [displayResponse, scrollRef, isNearBottomRef]);

  const handleRetry = useCallback(() => {
    const lastHuman = dedupedMessages.findLast(m => m.role === "human");
    if (lastHuman?.content && isConnected) {
      setAwaitingTimedOut(false);
      setRetryCount(c => c + 1);
      sendMessage({ type: "text-input", text: lastHuman.content, images: [] });
    }
  }, [dedupedMessages, sendMessage, isConnected]);

  return (
    <>
      {(showStreaming || showTyping) && (
        <ThinkingBubble
          content={displayResponse}
          isThinking={showTyping}
          isStreaming={showStreaming}
        />
      )}

      {awaitingTimedOut && !isStreaming && !showTyping && (
        <div style={S_TIMEOUT_WRAP}>
          <span style={S_TIMEOUT_TEXT}>{t("chat.noResponse")}</span>
          <button onClick={handleRetry} style={S_RETRY_BTN}>
            {t("chat.retry")}
          </button>
        </div>
      )}
    </>
  );
});
StreamingFooter.displayName = "StreamingFooter";

export const ChatArea = memo(() => {
  const { messages, appendHumanMessage } = useChatMessages();
  const { getFullResponse } = useStreamingRef();
  const { isThinkingSpeaking } = useAiState();
  const { sendMessage, wsState } = useWebSocket();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rafScrollRef = useRef(0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Virtuoso needs a mounted DOM element as customScrollParent.
  // useLayoutEffect sets it before paint so the second render includes Virtuoso.
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setScrollParent(scrollRef.current); }, []);
  // Track message count so we can detect newly-added human messages
  const lastMsgCountRef = useRef(messages.length);
  // Track first message ID to detect conversation switches (full message replacement)
  const prevFirstMsgIdRef = useRef<string | undefined>(undefined);

  // Track empty-state exit animation: keep showing for 350ms with fade-out
  const [emptyExiting, setEmptyExiting] = useState(false);
  const prevEmptyRef = useRef(true);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  // Ref mirrors isNearBottom so the auto-scroll effect can read the latest
  // value without depending on it (avoids re-firing on scroll-position changes).
  const isNearBottomRef = useRef(true);
  // true during the render immediately after streaming ends — lets us skip
  // the entry animation on the just-committed AI bubble (avoids a blink).
  const wasStreamingRef = useRef(false);

  const checkNearBottom = useCallback(() => {
    if (rafScrollRef.current) return;
    rafScrollRef.current = requestAnimationFrame(() => {
      rafScrollRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      isNearBottomRef.current = near;
      setIsNearBottom((prev) => (prev === near ? prev : near));
      if (near) setHasNewMessage(false);
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkNearBottom, { passive: true });
    return () => {
      el.removeEventListener("scroll", checkNearBottom);
      if (rafScrollRef.current) {
        cancelAnimationFrame(rafScrollRef.current);
        rafScrollRef.current = 0;
      }
    };
  }, [checkNearBottom]);

  // Scroll to bottom when the chat panel transitions from collapsed (0 height)
  // to expanded. Without this, reopening the panel shows old messages at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let wasCollapsed = el.clientHeight < 20;
    const ro = new ResizeObserver(() => {
      const collapsed = el.clientHeight < 20;
      if (wasCollapsed && !collapsed) {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
      wasCollapsed = collapsed;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Detect conversation switch: messages array fully replaced (different first message).
    // Always scroll to bottom so the user sees the latest messages of the loaded conversation.
    const firstId = messages[0]?.id;
    const isConversationSwitch = prevFirstMsgIdRef.current !== undefined
      && firstId !== prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstId;

    if (isConversationSwitch) {
      lastMsgCountRef.current = messages.length;
      setHasNewMessage(false);
      const container = scrollRef.current;
      if (container) {
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
      }
      return;
    }

    // Detect newly-added human message → always scroll to show it,
    // even if the user had scrolled up to read history.
    const isNewMsg = messages.length !== lastMsgCountRef.current;
    const lastMsg = messages[messages.length - 1];
    const isOwnNewMsg = isNewMsg && lastMsg?.role === "human";
    lastMsgCountRef.current = messages.length;

    if (!isNearBottomRef.current && !isOwnNewMsg) {
      setHasNewMessage(true);
      return;
    }
    const container = scrollRef.current;
    if (!container) return;
    // getFullResponse() reads streaming state at call-time without subscribing.
    // Streaming auto-scroll is handled by StreamingFooter; this is only for
    // new-message scroll (decides instant vs smooth based on active streaming).
    if (getFullResponse()) {
      container.scrollTop = container.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, getFullResponse]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  }, []);

  const isConnected = wsState === "OPEN";

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

  const showStreaming = useMemo(() => {
    if (!isStreaming) return false;
    const lastAiMsg = dedupedMessages.findLast(m => m.role === 'ai');
    return !(lastAiMsg && lastAiMsg.content && displayResponse === lastAiMsg.content);
  }, [isStreaming, dedupedMessages, displayResponse]);

  // Mirror showStreaming into a ref so the memoized message list can read it
  // without adding a dependency (avoids re-rendering all messages each frame).
  useEffect(() => { wasStreamingRef.current = showStreaming; }, [showStreaming]);

  // Bridge the gap between "message sent" and "AI starts thinking":
  // show typing dots immediately when the last message is from the user.
  const awaitingReply = useMemo(() => {
    if (isThinkingSpeaking || isStreaming || !isConnected) return false;
    const lastMsg = dedupedMessages[dedupedMessages.length - 1];
    return lastMsg?.role === "human";
  }, [dedupedMessages, isThinkingSpeaking, isStreaming, isConnected]);

  // Safety timeout: if awaitingReply stays true for 15s (billing block,
  // sendChat failure, or server not responding), stop showing typing dots.
  const [awaitingTimedOut, setAwaitingTimedOut] = useState(false);
  // Counter to force-restart the timeout timer on retry (messages.length
  // doesn't change on retry, so we need a separate trigger).
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (!awaitingReply) {
      setAwaitingTimedOut(false);
      return;
    }
    // Reset on every new message so the timer restarts when the user
    // sends again after a previous timeout (awaitingReply stays true).
    setAwaitingTimedOut(false);
    const timer = setTimeout(() => setAwaitingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [awaitingReply, messages.length, retryCount]);

  const showTyping = (isThinkingSpeaking || (awaitingReply && !awaitingTimedOut)) && !isStreaming;

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

  const welcomeChips = useMemo(() => t("ui.welcomeChips", { returnObjects: true }) as string[], [t]);
  const postGreetingChips = useMemo(() => t("ui.postGreetingChips", { returnObjects: true }) as string[], [t]);

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
      if (!isConnected) return;
      appendHumanMessage(text);
      sendMessage({ type: "text-input", text, images: [] });
      // Focus textarea so the user is ready to type when AI responds
      setTimeout(() => {
        (document.querySelector(".ling-textarea") as HTMLElement)?.focus();
      }, 0);
    },
    [appendHumanMessage, sendMessage, isConnected]
  );

  const handleRetry = useCallback(() => {
    const lastHuman = dedupedMessages.findLast(m => m.role === "human");
    if (lastHuman?.content && isConnected) {
      setAwaitingTimedOut(false);
      setRetryCount(c => c + 1);
      sendMessage({ type: "text-input", text: lastHuman.content, images: [] });
    }
  }, [dedupedMessages, sendMessage, isConnected]);

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
      style={S_CONTAINER}
    >
      {(isEmpty || emptyExiting) && (
        <div style={emptyExiting ? S_EMPTY_WRAP_EXIT : S_EMPTY_WRAP}>
          <span style={S_EMPTY_ICON}>✦</span>

          {/* Glassmorphism welcome card */}
          <div className="ling-welcome-card" style={S_WELCOME_CARD}>
            <span style={S_WELCOME_TITLE}>{welcomeTitle}</span>
            <span style={S_WELCOME_SUB}>{t("ui.emptySubHint")}</span>
          </div>

          {/* Suggestion chips */}
          <SuggestionChips chips={welcomeChips} onChipClick={handleChipClick} centered />
        </div>
      )}
      {hiddenCount > 0 && (
        <div style={S_LOAD_MORE_WRAP}>
          <button onClick={handleLoadMore} style={S_LOAD_MORE_BTN}>
            {t("chat.loadOlder", { count: hiddenCount })}
          </button>
        </div>
      )}
      {scrollParent && (
        <Virtuoso
          ref={virtuosoRef}
          customScrollParent={scrollParent}
          data={visibleMessages}
          increaseViewportBy={400}
          computeItemKey={computeItemKey}
          itemContent={itemContent}
        />
      )}
      {/* Suggestion chips: stay visible after greeting until user sends first message */}
      {isGreeting && !emptyExiting && (
        <SuggestionChips chips={postGreetingChips} onChipClick={handleChipClick} baseDelay={0.2} />
      )}

      {(showStreaming || showTyping) && (
        <ThinkingBubble
          content={displayResponse}
          isThinking={showTyping}
          isStreaming={showStreaming}
        />
      )}

      {/* Hint when typing indicator timed out — silent disappearance is confusing */}
      {awaitingTimedOut && !isStreaming && !showTyping && (
        <div style={S_TIMEOUT_WRAP}>
          <span style={S_TIMEOUT_TEXT}>{t("chat.noResponse")}</span>
          <button onClick={handleRetry} style={S_RETRY_BTN}>
            {t("chat.retry")}
          </button>
        </div>
      )}

      <div ref={bottomRef} />

      {!isNearBottom && (
        <div style={S_SCROLL_WRAP}>
          <button
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
