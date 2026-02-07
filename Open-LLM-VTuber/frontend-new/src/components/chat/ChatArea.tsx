import { Box } from "@chakra-ui/react";
import { memo, useEffect, useRef } from "react";
import { ChatBubble } from "./ChatBubble";
import { useChatHistory } from "@/context/chat-history-context";
import { useSubtitle } from "@/context/subtitle-context";

export const ChatArea = memo(() => {
  const { messages, fullResponse } = useChatHistory();
  const { subtitleText } = useSubtitle();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, fullResponse, subtitleText]);

  // Determine if AI is currently streaming
  const isStreaming = fullResponse.length > 0;

  return (
    <Box
      ref={scrollRef}
      height="100%"
      overflowY="auto"
      py="12px"
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
          </>
        );
      })()}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </Box>
  );
});

ChatArea.displayName = "ChatArea";
