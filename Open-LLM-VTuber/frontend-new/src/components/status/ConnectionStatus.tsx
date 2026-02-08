import { Box, Text } from "@chakra-ui/react";
import { memo, useState, useEffect, useRef } from "react";
import { useWebSocket } from "@/context/websocket-context";

/**
 * Minimal connection status indicator.
 * - Connected: tiny green dot, auto-fades after 2s
 * - Connecting/Reconnecting: pulsing amber dot + "重连中..."
 * - Disconnected: red dot + "连接断开" + click-to-retry
 */
export const ConnectionStatus = memo(() => {
  const { wsState, reconnect } = useWebSocket();
  const [showConnected, setShowConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const isOpen = wsState === "OPEN";
  const isConnecting = wsState === "CONNECTING";
  const isClosed = wsState === "CLOSED";

  // Flash the green dot briefly when connection is established, then fade
  useEffect(() => {
    if (isOpen) {
      setShowConnected(true);
      timerRef.current = setTimeout(() => setShowConnected(false), 2000);
    } else {
      setShowConnected(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  // When connected and the flash period is over, render nothing
  if (isOpen && !showConnected) return null;

  const dotColor = isOpen
    ? "#4ade80"
    : isConnecting
      ? "#fbbf24"
      : "#f87171";

  const label = isOpen
    ? "已连接"
    : isConnecting
      ? "重连中..."
      : "连接断开";

  return (
    <Box
      as={isClosed ? "button" : undefined}
      onClick={isClosed ? reconnect : undefined}
      display="flex"
      alignItems="center"
      gap="6px"
      px="10px"
      py="5px"
      bg="rgba(0, 0, 0, 0.35)"
      backdropFilter="blur(12px)"
      borderRadius="16px"
      border="1px solid"
      borderColor={isClosed ? "rgba(248, 113, 113, 0.3)" : "rgba(255,255,255,0.06)"}
      cursor={isClosed ? "pointer" : "default"}
      transition="all 0.4s ease"
      opacity={isOpen ? 0.7 : 1}
      _hover={isClosed ? { bg: "rgba(0, 0, 0, 0.55)", borderColor: "rgba(248, 113, 113, 0.5)" } : {}}
      css={isOpen ? {
        animation: "connFadeIn 0.3s ease-out",
        "@keyframes connFadeIn": {
          from: { opacity: 0, transform: "translateY(-4px)" },
          to: { opacity: 0.7, transform: "translateY(0)" },
        },
      } : undefined}
    >
      {/* Status dot */}
      <Box
        w="7px"
        h="7px"
        borderRadius="50%"
        bg={dotColor}
        boxShadow={`0 0 6px ${dotColor}88`}
        flexShrink={0}
        css={isConnecting ? {
          animation: "connPulse 1.2s ease-in-out infinite",
          "@keyframes connPulse": {
            "0%, 100%": { opacity: 1, transform: "scale(1)" },
            "50%": { opacity: 0.4, transform: "scale(0.8)" },
          },
        } : undefined}
      />

      {/* Label — hidden when connected (just the dot shows) */}
      {!isOpen && (
        <Text
          fontSize="11px"
          color={isClosed ? "rgba(248, 113, 113, 0.9)" : "rgba(251, 191, 36, 0.9)"}
          fontWeight="500"
          whiteSpace="nowrap"
          lineHeight="1"
        >
          {label}
        </Text>
      )}

      {/* Click hint for disconnected state */}
      {isClosed && (
        <Text fontSize="10px" color="rgba(255,255,255,0.35)" whiteSpace="nowrap" lineHeight="1">
          点击重试
        </Text>
      )}
    </Box>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";
