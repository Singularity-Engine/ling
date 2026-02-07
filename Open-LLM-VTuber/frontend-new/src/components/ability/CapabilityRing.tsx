import { Box, Text } from "@chakra-ui/react";
import { memo, useCallback } from "react";
import { useToolState, type ToolCategory } from "../../context/tool-state-context";

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: "#60a5fa",
  code: "#10b981",
  memory: "#a78bfa",
  weather: "#facc15",
  generic: "#8b5cf6",
};

const ABILITIES = [
  { key: "search" as ToolCategory, icon: "🔍", label: "搜索", prompt: "帮我搜索 " },
  { key: "code" as ToolCategory, icon: "💻", label: "代码", prompt: "帮我写代码 " },
  { key: "memory" as ToolCategory, icon: "🧠", label: "记忆", prompt: "你还记得 " },
  { key: "weather" as ToolCategory, icon: "🌤️", label: "天气", prompt: "今天天气怎么样？" },
  { key: "generic" as ToolCategory, icon: "🔧", label: "工具", prompt: "帮我 " },
] as const;

// Arc layout: 5 buttons spread across ~120 degrees, centered at bottom
const ARC_RADIUS = 90; // px from center
const ARC_START = -60; // degrees (left side)
const ARC_STEP = 30; // degrees between buttons

export const CapabilityRing = memo(() => {
  const { dominantCategory } = useToolState();

  const handleClick = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("fill-input", { detail: { text: prompt } })
    );
  }, []);

  return (
    <Box
      position="relative"
      display="flex"
      justifyContent="center"
      py="8px"
      pointerEvents="auto"
      opacity={0.5}
      transition="opacity 0.3s ease"
      _hover={{ opacity: 0.9 }}
    >
      <Box position="relative" w={`${ARC_RADIUS * 2 + 40}px`} h="56px">
        {ABILITIES.map((ability, i) => {
          const angleDeg = ARC_START + i * ARC_STEP;
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = ARC_RADIUS * Math.sin(angleRad);
          const y = -ARC_RADIUS * Math.cos(angleRad) + ARC_RADIUS;
          const isActive = dominantCategory === ability.key;
          const color = CATEGORY_COLORS[ability.key];

          return (
            <Box
              key={ability.key}
              as="button"
              position="absolute"
              left="50%"
              bottom="0"
              w="36px"
              h="36px"
              borderRadius="50%"
              bg="rgba(10, 0, 21, 0.6)"
              backdropFilter="blur(12px)"
              border="1px solid"
              borderColor={isActive ? `${color}88` : "rgba(255, 255, 255, 0.12)"}
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              transition="all 0.3s ease"
              onClick={() => handleClick(ability.prompt)}
              title={ability.label}
              css={{
                transform: `translate(calc(-50% + ${x}px), calc(${y - ARC_RADIUS}px)) scale(${isActive ? 1.15 : 1})`,
                boxShadow: isActive ? `0 0 16px ${color}55, 0 0 4px ${color}33` : "none",
                animation: isActive ? `ringPulse_${ability.key} 2s ease-in-out infinite` : "none",
                [`@keyframes ringPulse_${ability.key}`]: {
                  "0%, 100%": { boxShadow: `0 0 12px ${color}33` },
                  "50%": { boxShadow: `0 0 22px ${color}66` },
                },
                "&:hover": {
                  transform: `translate(calc(-50% + ${x}px), calc(${y - ARC_RADIUS}px)) scale(1.2)`,
                  borderColor: `${color}aa`,
                  boxShadow: `0 0 20px ${color}44`,
                },
              }}
            >
              <Text fontSize="16px" lineHeight="1">{ability.icon}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

CapabilityRing.displayName = "CapabilityRing";
