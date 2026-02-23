import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ThinkingBubble } from "./ThinkingBubble";
import { useStreamingValue } from "@/context/chat-history-context";
import { useAiStateRead } from "@/context/ai-state-context";
import { useWebSocketState, useWebSocketActions } from "@/context/websocket-context";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import type { Message } from "@/services/websocket-service";

// ─── Style constants ───

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
  color: "var(--ling-text-secondary)",
  textAlign: "center",
  lineHeight: 1.5,
};

const S_RETRY_BTN: CSSProperties = {
  background: "var(--ling-purple-20)",
  border: "1px solid var(--ling-purple-30)",
  borderRadius: "14px",
  padding: "6px 20px",
  color: "var(--ling-purple-light)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
  fontWeight: 500,
};

// ─── Component ───

export interface StreamingFooterProps {
  scrollRef: { current: HTMLDivElement | null };
  isNearBottomRef: { current: boolean };
  wasStreamingRef: { current: boolean };
  dedupedMessages: Message[];
}

export const StreamingFooter = memo(function StreamingFooter({
  scrollRef,
  isNearBottomRef,
  wasStreamingRef,
  dedupedMessages,
}: StreamingFooterProps) {
  const { fullResponse } = useStreamingValue();
  const { isThinkingSpeaking } = useAiStateRead();
  const { wsState } = useWebSocketState();
  const { sendMessage } = useWebSocketActions();
  const { t } = useTranslation();

  const displayResponse = useThrottledValue(fullResponse);
  const isStreaming = displayResponse.length > 0;
  const isConnected = wsState === "OPEN";
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

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
    if (lastHuman?.content && isConnectedRef.current) {
      setAwaitingTimedOut(false);
      setRetryCount(c => c + 1);
      sendMessage({ type: "text-input", text: lastHuman.content, images: [] });
    }
  }, [dedupedMessages, sendMessage]);

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
