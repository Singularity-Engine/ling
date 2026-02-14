import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { TypingIndicator } from "./TypingIndicator";
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
  `;
  document.head.appendChild(style);
}

export const ChatArea = memo(() => {
  const { messages, fullResponse } = useChatHistory();
  const { subtitleText } = useSubtitle();
  const { isThinkingSpeaking } = useAiState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewMessage(true);
    }
  }, [messages, fullResponse, subtitleText, isNearBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  }, []);

  const isStreaming = fullResponse.length > 0;
  const showTyping = isThinkingSpeaking && !isStreaming;

  return (
    <div
      ref={scrollRef}
      className="chat-area-scroll"
      role="log"
      aria-label="聊天消息"
      aria-live="polite"
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "12px 0",
        position: "relative",
      }}
    >
      {(() => {
        // Dedup: only remove exact adjacent duplicates (same role + same content)
        const dedupedMessages = messages.filter((msg, index, arr) => {
          if (index === 0) return true;
          const prev = arr[index - 1];
          return !(prev.role === msg.role && prev.content === msg.content);
        });

        const lastAiMsg = dedupedMessages.filter(m => m.role === 'ai').pop();
        const showStreaming = isStreaming && !(lastAiMsg && lastAiMsg.content && fullResponse.startsWith(lastAiMsg.content));
        const isEmpty = dedupedMessages.length === 0 && !showStreaming && !showTyping;

        return (
          <>
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
                  我在这里，随时可以聊
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "rgba(255, 255, 255, 0.2)",
                    textAlign: "center",
                  }}
                >
                  试试说「你好」或直接语音
                </span>
              </div>
            )}
            {dedupedMessages.map((msg) => (
              <ChatBubble
                key={msg.id}
                role={msg.role === "human" ? "user" : "assistant"}
                content={msg.content}
                isToolCall={msg.type === "tool_call_status"}
                toolName={msg.tool_name}
                toolStatus={msg.status}
              />
            ))}
            {showStreaming && (
              <ChatBubble
                role="assistant"
                content={fullResponse}
                isStreaming={true}
              />
            )}
            {showTyping && <TypingIndicator />}
          </>
        );
      })()}

      <div ref={bottomRef} />

      {hasNewMessage && (
        <div
          style={{
            position: "sticky",
            bottom: "8px",
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <button
            onClick={scrollToBottom}
            aria-label="滚动到最新消息"
            style={{
              pointerEvents: "auto",
              padding: "6px 14px",
              borderRadius: "16px",
              background: "rgba(139, 92, 246, 0.85)",
              color: "rgba(255,255,255,0.95)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid rgba(139, 92, 246, 0.4)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.3)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              animation: "chatFadeInUp 0.25s ease-out",
            }}
          >
            <span style={{ marginRight: "4px" }}>&#8595;</span>
            新消息
          </button>
        </div>
      )}
    </div>
  );
});

ChatArea.displayName = "ChatArea";
