import { Box, Text } from "@chakra-ui/react";
import { memo, useState, useCallback } from "react";
import type { ToolCategory } from "../../context/tool-state-context";

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: "#60a5fa",
  code: "#10b981",
  memory: "#a78bfa",
  weather: "#facc15",
  generic: "#8b5cf6",
};

const TOOL_ICONS: Record<string, string> = {
  search: "🔍",
  code: "💻",
  memory: "🧠",
  weather: "🌤️",
  generic: "🔧",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "⚡",
  completed: "✅",
  error: "❌",
};

interface InfoCrystalProps {
  tool: {
    id: string;
    name: string;
    category: string;
    status: string;
    result?: string;
    partialResult?: string;
  };
  position: "left" | "right" | "center";
  index: number;
  onDismiss?: () => void;
}

export const InfoCrystal = memo(({ tool, position, index, onDismiss }: InfoCrystalProps) => {
  const [expanded, setExpanded] = useState(false);
  const color = CATEGORY_COLORS[(tool.category as ToolCategory) ?? "generic"] || CATEGORY_COLORS.generic;
  const icon = TOOL_ICONS[tool.category] || TOOL_ICONS.generic;
  const statusIcon = STATUS_ICONS[tool.status] || "⏳";
  const content = tool.result || tool.partialResult || "";
  const rotateY = position === "left" ? 5 : position === "right" ? -5 : 0;
  const animDelay = index * 0.12;

  const handleClick = useCallback(() => {
    setExpanded((p) => !p);
  }, []);

  const handleOverlayClick = useCallback(() => {
    setExpanded(false);
  }, []);

  if (expanded) {
    return (
      <>
        {/* Overlay backdrop */}
        <Box
          position="fixed"
          inset="0"
          bg="rgba(0, 0, 0, 0.6)"
          zIndex={998}
          onClick={handleOverlayClick}
          css={{
            animation: "crystalOverlayIn 0.25s ease-out forwards",
            "@keyframes crystalOverlayIn": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        />
        {/* Expanded card */}
        <Box
          position="fixed"
          top="50%"
          left="50%"
          zIndex={999}
          w="80vw"
          maxW="720px"
          maxH="70vh"
          bg="rgba(10, 0, 21, 0.85)"
          backdropFilter="blur(24px)"
          border={`1px solid ${color}66`}
          borderRadius="20px"
          p="24px"
          color="white"
          overflowY="auto"
          cursor="pointer"
          onClick={handleClick}
          css={{
            transform: "translate(-50%, -50%)",
            animation: "crystalExpandIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            boxShadow: `0 0 40px ${color}33, 0 8px 32px rgba(0, 0, 0, 0.5)`,
            "@keyframes crystalExpandIn": {
              from: { opacity: 0, transform: "translate(-50%, -50%) scale(0.8)" },
              to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
            },
          }}
        >
          {/* Header */}
          <Box display="flex" alignItems="center" gap="8px" mb="16px">
            <Text fontSize="20px">{icon}</Text>
            <Text fontSize="16px" fontWeight="600" flex="1">
              {tool.name}
            </Text>
            <Text fontSize="14px">{statusIcon}</Text>
          </Box>
          {/* Full content */}
          <Text
            fontSize="13px"
            lineHeight="1.7"
            color="rgba(255, 255, 255, 0.8)"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
          >
            {content || "暂无内容"}
          </Text>
        </Box>
      </>
    );
  }

  return (
    <Box
      w="200px"
      minH="80px"
      maxH="200px"
      bg="rgba(10, 0, 21, 0.6)"
      backdropFilter="blur(16px)"
      border={`1px solid ${color}55`}
      borderRadius="16px"
      p="12px 14px"
      color="white"
      cursor="pointer"
      onClick={handleClick}
      overflow="hidden"
      css={{
        transform: `perspective(800px) rotateY(${rotateY}deg)`,
        animation: `crystalEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay}s both, crystalBreathe 3s ease-in-out ${animDelay}s infinite`,
        "@keyframes crystalEnter": {
          from: { opacity: 0, transform: `perspective(800px) rotateY(${rotateY}deg) scale(0.5) translateY(40px)` },
          to: { opacity: 1, transform: `perspective(800px) rotateY(${rotateY}deg) scale(1) translateY(0)` },
        },
        "@keyframes crystalBreathe": {
          "0%, 100%": { boxShadow: `0 0 15px ${color}22` },
          "50%": { boxShadow: `0 0 25px ${color}44` },
        },
        transition: "transform 0.2s ease, border-color 0.3s ease",
        "&:hover": {
          transform: `perspective(800px) rotateY(${rotateY * 0.5}deg) scale(1.03)`,
          borderColor: `${color}88`,
        },
      }}
    >
      {/* Header */}
      <Box display="flex" alignItems="center" gap="6px" mb="6px">
        <Text fontSize="14px" lineHeight="1">{icon}</Text>
        <Text
          fontSize="12px"
          fontWeight="600"
          flex="1"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          color="rgba(255, 255, 255, 0.9)"
        >
          {tool.name}
        </Text>
        <Text fontSize="12px" lineHeight="1">{statusIcon}</Text>
      </Box>

      {/* Body - max 3 lines */}
      <Text
        fontSize="11px"
        lineHeight="1.5"
        color="rgba(255, 255, 255, 0.6)"
        overflow="hidden"
        textOverflow="ellipsis"
        css={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {content || (tool.status === "running" ? "执行中..." : "等待结果...")}
      </Text>

      {/* Footer */}
      <Text
        fontSize="10px"
        color={`${color}99`}
        mt="6px"
        textAlign="right"
      >
        点击查看详情 →
      </Text>
    </Box>
  );
});

InfoCrystal.displayName = "InfoCrystal";
