import { Box, Text } from "@chakra-ui/react";
import { memo } from "react";
import { ToolResultCard } from "./ToolResultCard";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: string;
}

export const ChatBubble = memo(({ role, content, isStreaming, isToolCall, toolName, toolStatus }: ChatBubbleProps) => {
  const isUser = role === "user";

  // 工具调用 → 用 ToolResultCard
  if (isToolCall && toolName) {
    return (
      <Box px="16px" mb="10px" maxW="90%" ml="0">
        <ToolResultCard toolName={toolName} content={content} status={toolStatus || "running"} />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      mb="12px"
      px="16px"
      css={{
        animation: "fadeInUp 0.3s ease-out",
        "@keyframes fadeInUp": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      <Box
        maxW="78%"
        px="16px"
        py="10px"
        borderRadius={isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px"}
        bg={isUser
          ? "linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(109, 40, 217, 0.25))"
          : "rgba(255, 255, 255, 0.06)"}
        border="1px solid"
        borderColor={isUser ? "rgba(139, 92, 246, 0.25)" : "rgba(255, 255, 255, 0.06)"}
        backdropFilter="blur(10px)"
        transition="all 0.2s ease"
        boxShadow={isUser ? "0 2px 12px rgba(139, 92, 246, 0.15)" : "none"}
      >
        <Text
          fontSize="14px"
          color={isUser ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.88)"}
          whiteSpace="pre-wrap"
          lineHeight="1.7"
          letterSpacing="0.3px"
        >
          {content}
          {isStreaming && (
            <Box
              as="span"
              display="inline-block"
              w="6px"
              h="6px"
              borderRadius="50%"
              bg="#8b5cf6"
              ml="4px"
              verticalAlign="middle"
              css={{
                animation: "pulse 1.2s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 0.4, transform: "scale(0.8)" },
                  "50%": { opacity: 1, transform: "scale(1.2)" },
                },
              }}
            />
          )}
        </Text>
      </Box>
    </Box>
  );
});

ChatBubble.displayName = "ChatBubble";
