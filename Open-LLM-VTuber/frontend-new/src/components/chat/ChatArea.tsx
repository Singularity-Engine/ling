import { Box, Text } from "@chakra-ui/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { TypingIndicator } from "./TypingIndicator";
import { useChatHistory } from "@/context/chat-history-context";
import { useSubtitle } from "@/context/subtitle-context";
import { useAiState } from "@/context/ai-state-context";

export const ChatArea = memo(() => {
  const { messages, fullResponse } = useChatHistory();
  const { subtitleText } = useSubtitle();
  const { isThinkingSpeaking } = useAiState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smart scroll: track whether user is near bottom
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "near bottom" if within 80px of the bottom edge
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsNearBottom(near);
    if (near) setHasNewMessage(false);
  }, []);

  // Listen to scroll events
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkNearBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkNearBottom);
  }, [checkNearBottom]);

  // Auto-scroll only when user is near bottom
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

  // Determine if AI is currently streaming text
  const isStreaming = fullResponse.length > 0;
  // Show typing indicator: AI is thinking but no text yet
  const showTyping = isThinkingSpeaking && !isStreaming;

  return (
    <Box
      ref={scrollRef}
      height="100%"
      overflowY="auto"
      py="12px"
      position="relative"
      css={{
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": {
          background: "rgba(139, 92, 246, 0.3)",
          borderRadius: "2px",
        },
      }}
    >
      {/* Render message history (deduplicated) */}
      {(() => {
        // 消息去重：同角色+同内容的连续消息只保留最后一个
        const dedupedMessages = messages.filter((msg, index, arr) => {
          if (index === 0) return true;
          const prev = arr[index - 1];
          if (prev.role === msg.role && prev.content === msg.content) return false;
          // 也处理内容包含关系（后端可能发短版+长版）
          if (prev.role === msg.role && msg.content && prev.content &&
              (msg.content.startsWith(prev.content) || prev.content.startsWith(msg.content))) {
            return false;
          }
          return true;
        });

        // 判断是否需要显示 streaming bubble
        const lastAiMsg = dedupedMessages.filter(m => m.role === 'ai').pop();
        const showStreaming = isStreaming && !(lastAiMsg && lastAiMsg.content && fullResponse.startsWith(lastAiMsg.content));

        return (
          <>
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

      {/* Scroll anchor */}
      <div ref={bottomRef} />

      {/* New message indicator */}
      {hasNewMessage && (
        <Box
          position="sticky"
          bottom="8px"
          display="flex"
          justifyContent="center"
          pointerEvents="none"
        >
          <Box
            as="button"
            pointerEvents="auto"
            onClick={scrollToBottom}
            px="14px"
            py="6px"
            borderRadius="16px"
            bg="rgba(139, 92, 246, 0.85)"
            color="rgba(255,255,255,0.95)"
            fontSize="12px"
            fontWeight="500"
            border="1px solid rgba(139, 92, 246, 0.4)"
            backdropFilter="blur(12px)"
            boxShadow="0 2px 12px rgba(139, 92, 246, 0.3)"
            cursor="pointer"
            transition="all 0.2s ease"
            _hover={{ bg: "rgba(139, 92, 246, 0.95)" }}
            css={{
              animation: "fadeInUp 0.25s ease-out",
              "@keyframes fadeInUp": {
                from: { opacity: 0, transform: "translateY(8px)" },
                to: { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            <Text as="span" mr="4px">&#8595;</Text>
            新消息
          </Box>
        </Box>
      )}
    </Box>
  );
});

ChatArea.displayName = "ChatArea";
