import { Box, Textarea, Text } from "@chakra-ui/react";
import { memo, useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "@/context/websocket-context";
import { useChatHistory } from "@/context/chat-history-context";
import { useAiState } from "@/context/ai-state-context";
import { useInterrupt } from "@/components/canvas/live2d";
import { useVAD } from "@/context/vad-context";

// 麦克风 SVG 图标
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

// 发送 SVG 图标
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// 停止 SVG 图标
const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

// AI 状态文字
const AI_STATE_TEXT: Record<string, string> = {
  idle: "",
  loading: "加载中...",
  thinking: "思考中...",
  "thinking-speaking": "说话中...",
  interrupted: "",
};

export const InputBar = memo(() => {
  const [inputText, setInputText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsContext = useWebSocket();
  const { appendHumanMessage } = useChatHistory();
  const { aiState } = useAiState();
  const { interrupt } = useInterrupt();
  const { micOn, startMic, stopMic } = useVAD();

  // Listen for fill-input events from CapabilityRing
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (typeof text === 'string') {
        setInputText(text);
        // Focus the textarea so user can continue typing
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener('fill-input', handler);
    return () => window.removeEventListener('fill-input', handler);
  }, []);

  const hasText = inputText.trim().length > 0;
  const isAiBusy = aiState === "thinking" || aiState === "thinking-speaking";
  const stateText = AI_STATE_TEXT[aiState] || "";

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !wsContext) return;

    if (aiState === "thinking-speaking") {
      interrupt();
    }

    appendHumanMessage(text);
    wsContext.sendMessage({
      type: "text-input",
      text: text,
      images: [],
    });

    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [inputText, wsContext, aiState, interrupt, appendHumanMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [isComposing, handleSend]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

  const handleMicToggle = useCallback(() => {
    if (micOn) {
      stopMic();
    } else {
      startMic();
    }
  }, [micOn, startMic, stopMic]);

  const handleInterrupt = useCallback(() => {
    interrupt();
  }, [interrupt]);

  return (
    <Box
      px="16px"
      py="10px"
      bg="rgba(255, 255, 255, 0.03)"
      backdropFilter="blur(20px)"
      borderTop="1px solid rgba(255, 255, 255, 0.06)"
      pb="calc(10px + env(safe-area-inset-bottom, 0px))"
    >
      {/* AI 状态指示 */}
      {stateText && (
        <Box display="flex" justifyContent="center" mb="6px">
          <Text
            fontSize="11px"
            color="rgba(139, 92, 246, 0.7)"
            css={{
              animation: "pulse 1.5s ease-in-out infinite",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 0.5 },
                "50%": { opacity: 1 },
              },
            }}
          >
            {stateText}
          </Text>
        </Box>
      )}

      <Box
        display="flex"
        alignItems="flex-end"
        gap="8px"
        maxW="720px"
        mx="auto"
      >
        {/* 麦克风按钮 */}
        <Box
          as="button"
          onClick={handleMicToggle}
          w="42px"
          h="42px"
          borderRadius="50%"
          bg={micOn ? "rgba(239, 68, 68, 0.2)" : "rgba(255,255,255,0.06)"}
          border={micOn ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(255,255,255,0.08)"}
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          transition="all 0.2s ease"
          flexShrink={0}
          color={micOn ? "#ef4444" : "rgba(255,255,255,0.5)"}
          css={micOn ? {
            animation: "micPulse 1.5s ease-in-out infinite",
            "@keyframes micPulse": {
              "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.4)" },
              "50%": { boxShadow: "0 0 0 8px rgba(239, 68, 68, 0)" },
            },
          } : {}}
          _hover={{
            bg: micOn ? "rgba(239, 68, 68, 0.3)" : "rgba(255,255,255,0.1)",
            color: micOn ? "#ef4444" : "rgba(255,255,255,0.7)",
          }}
        >
          <MicIcon />
        </Box>

        {/* 输入框 */}
        <Textarea
          ref={textareaRef}
          value={inputText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={micOn ? "语音聆听中..." : "和灵说点什么..."}
          rows={1}
          resize="none"
          flex="1"
          bg="rgba(255, 255, 255, 0.06)"
          border="1px solid rgba(255, 255, 255, 0.1)"
          borderRadius="16px"
          color="white"
          fontSize="14px"
          px="16px"
          py="10px"
          minH="42px"
          maxH="96px"
          _placeholder={{ color: "rgba(255, 255, 255, 0.3)" }}
          _focus={{
            borderColor: "rgba(139, 92, 246, 0.5)",
            boxShadow: "0 0 0 1px rgba(139, 92, 246, 0.3)",
            outline: "none",
          }}
          _hover={{
            borderColor: "rgba(255, 255, 255, 0.15)",
          }}
        />

        {/* 发送 / 停止按钮 */}
        <Box
          as="button"
          onClick={isAiBusy ? handleInterrupt : handleSend}
          w="42px"
          h="42px"
          borderRadius="50%"
          bg={isAiBusy
            ? "rgba(239, 68, 68, 0.2)"
            : hasText
              ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
              : "rgba(255,255,255,0.06)"}
          border={isAiBusy ? "1px solid rgba(239, 68, 68, 0.3)" : "none"}
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor={hasText || isAiBusy ? "pointer" : "default"}
          transition="all 0.2s ease"
          flexShrink={0}
          _hover={(hasText || isAiBusy) ? {
            transform: "scale(1.05)",
            boxShadow: isAiBusy
              ? "0 0 20px rgba(239, 68, 68, 0.3)"
              : "0 0 20px rgba(139, 92, 246, 0.3)",
          } : {}}
        >
          {isAiBusy ? <StopIcon /> : <SendIcon />}
        </Box>
      </Box>
    </Box>
  );
});

InputBar.displayName = "InputBar";
