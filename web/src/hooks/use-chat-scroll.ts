/**
 * useChatScroll — scroll management for the chat message list.
 *
 * Encapsulates:
 *  • near-bottom detection with rAF-throttled scroll checking
 *  • scroll event listener lifecycle
 *  • ResizeObserver: auto-scroll when panel expands from collapsed state
 *  • conversation-switch detection (full message replacement)
 *  • auto-scroll on new human messages
 *  • "new message" indicator state
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Message } from "@/services/websocket-service";

/** Threshold (px) below scroll bottom to consider "near bottom". */
const NEAR_BOTTOM_PX = 120;
/** Panel height (px) below which the container counts as "collapsed". */
const COLLAPSED_HEIGHT_PX = 20;

export interface UseChatScrollReturn {
  /** Attach to the scrollable container div. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to a sentinel div at the very bottom of the list. */
  bottomRef: React.RefObject<HTMLDivElement | null>;
  /** Mounted scroll element for Virtuoso's customScrollParent. */
  scrollParent: HTMLElement | null;
  /** Whether the viewport is near the bottom of the list. */
  isNearBottom: boolean;
  /** Whether a new message arrived while the user scrolled away. */
  hasNewMessage: boolean;
  /** Ref mirror of isNearBottom — readable from effects without re-triggering them. */
  isNearBottomRef: React.RefObject<boolean>;
  /** Smooth-scroll to the bottom sentinel. */
  scrollToBottom: () => void;
}

export function useChatScroll(
  messages: Message[],
  getFullResponse: () => string,
): UseChatScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rafScrollRef = useRef(0);

  // Virtuoso needs a mounted DOM element as customScrollParent.
  // useLayoutEffect sets it before paint so the first paint includes Virtuoso.
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setScrollParent(scrollRef.current);
  }, []);

  // Track message count to detect newly-added human messages.
  const lastMsgCountRef = useRef(messages.length);
  // Track first message ID to detect conversation switches (full replacement).
  const prevFirstMsgIdRef = useRef<string | undefined>(undefined);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const isNearBottomRef = useRef(true);

  // ── Near-bottom detection (rAF-throttled) ──

  const checkNearBottom = useCallback(() => {
    if (rafScrollRef.current) return;
    rafScrollRef.current = requestAnimationFrame(() => {
      rafScrollRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const near =
        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      isNearBottomRef.current = near;
      setIsNearBottom((prev) => (prev === near ? prev : near));
      if (near) setHasNewMessage(false);
    });
  }, []);

  // Scroll event listener lifecycle.
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

  // ── Panel expand detection ──
  // Scroll to bottom when the chat panel transitions from collapsed (0 height)
  // to expanded. Without this, reopening the panel shows old messages at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let wasCollapsed = el.clientHeight < COLLAPSED_HEIGHT_PX;
    const ro = new ResizeObserver(() => {
      const collapsed = el.clientHeight < COLLAPSED_HEIGHT_PX;
      if (wasCollapsed && !collapsed) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
      wasCollapsed = collapsed;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-scroll on new messages / conversation switch ──
  useEffect(() => {
    // Detect conversation switch: messages array fully replaced (different first
    // message). Always scroll to bottom so the user sees the latest messages.
    const firstId = messages[0]?.id;
    const isConversationSwitch =
      prevFirstMsgIdRef.current !== undefined &&
      firstId !== prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstId;

    if (isConversationSwitch) {
      lastMsgCountRef.current = messages.length;
      setHasNewMessage(false);
      const container = scrollRef.current;
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
      return;
    }

    // Detect newly-added human message → always scroll to show it, even if the
    // user had scrolled up to read history.
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
    // Streaming auto-scroll is handled by StreamingFooter; this only decides
    // instant vs smooth for new-message scroll.
    if (getFullResponse()) {
      container.scrollTop = container.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, getFullResponse]);

  // ── Public actions ──

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  }, []);

  return {
    scrollRef,
    bottomRef,
    scrollParent,
    isNearBottom,
    hasNewMessage,
    isNearBottomRef,
    scrollToBottom,
  };
}
