import { Box, Text } from "@chakra-ui/react";
import { memo, useState, useMemo } from "react";
import { useAffinity } from "@/context/affinity-context";

const LEVEL_CONFIG: Record<string, { name: string; color: string; heartColor: string; beatSpeed: string }> = {
  hatred: { name: "敌意", color: "#ef4444", heartColor: "#4a1515", beatSpeed: "3s" },
  hostile: { name: "冷淡", color: "#f97316", heartColor: "#6b3a1a", beatSpeed: "2.5s" },
  indifferent: { name: "无感", color: "#a3a3a3", heartColor: "#525252", beatSpeed: "2.2s" },
  neutral: { name: "中立", color: "#60a5fa", heartColor: "#60a5fa", beatSpeed: "2s" },
  friendly: { name: "友好", color: "#a78bfa", heartColor: "#a78bfa", beatSpeed: "1.6s" },
  close: { name: "亲密", color: "#c084fc", heartColor: "#c084fc", beatSpeed: "1.2s" },
  devoted: { name: "挚爱", color: "#f472b6", heartColor: "#f472b6", beatSpeed: "0.8s" },
};

// SVG Heart paths for different "fill levels"
const HeartIcon = ({ color, fillPercent, size = 32 }: { color: string; fillPercent: number; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="heartFill" x1="0" y1="1" x2="0" y2="0">
        <stop offset={`${fillPercent}%`} stopColor={color} />
        <stop offset={`${fillPercent}%`} stopColor={`${color}33`} />
      </linearGradient>
    </defs>
    <path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      fill="url(#heartFill)"
      stroke={color}
      strokeWidth="0.5"
    />
  </svg>
);

export const AffinityBadge = memo(() => {
  const { affinity, level, milestone } = useAffinity();
  const [expanded, setExpanded] = useState(false);

  const config = useMemo(() => LEVEL_CONFIG[level] || LEVEL_CONFIG.neutral, [level]);

  return (
    <Box position="relative">
      {/* Heart button */}
      <Box
        as="button"
        onClick={() => setExpanded(!expanded)}
        display="flex"
        alignItems="center"
        gap="6px"
        px="10px"
        py="6px"
        bg="rgba(0, 0, 0, 0.4)"
        backdropFilter="blur(12px)"
        borderRadius="20px"
        border="1px solid rgba(255,255,255,0.08)"
        cursor="pointer"
        transition="all 0.3s ease"
        _hover={{
          bg: "rgba(0, 0, 0, 0.6)",
          border: `1px solid ${config.color}44`,
        }}
        css={{
          animation: `heartbeat ${config.beatSpeed} ease-in-out infinite`,
          "@keyframes heartbeat": {
            "0%, 100%": { transform: "scale(1)" },
            "14%": { transform: "scale(1.1)" },
            "28%": { transform: "scale(1)" },
            "42%": { transform: "scale(1.08)" },
            "70%": { transform: "scale(1)" },
          },
        }}
      >
        <HeartIcon color={config.heartColor} fillPercent={affinity} size={22} />
        <Text fontSize="12px" color="rgba(255,255,255,0.7)" fontFamily="monospace" fontWeight="500">
          {affinity}
        </Text>
      </Box>

      {/* Expanded panel */}
      {expanded && (
        <Box
          position="absolute"
          top="100%"
          right="0"
          mt="8px"
          p="16px"
          bg="rgba(10, 0, 21, 0.9)"
          backdropFilter="blur(20px)"
          borderRadius="16px"
          border="1px solid rgba(255,255,255,0.1)"
          minW="180px"
          boxShadow={`0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${config.color}22`}
          css={{
            animation: "fadeInDown 0.2s ease-out",
            "@keyframes fadeInDown": {
              from: { opacity: 0, transform: "translateY(-8px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Box display="flex" alignItems="center" gap="8px" mb="12px">
            <HeartIcon color={config.heartColor} fillPercent={affinity} size={28} />
            <Box>
              <Text fontSize="14px" color={config.color} fontWeight="700">
                {config.name}
              </Text>
              <Text fontSize="11px" color="rgba(255,255,255,0.4)">
                好感度
              </Text>
            </Box>
          </Box>

          {/* Progress bar */}
          <Box w="100%" h="4px" bg="rgba(255,255,255,0.08)" borderRadius="2px" mb="8px" overflow="hidden">
            <Box
              h="100%"
              w={`${affinity}%`}
              bg={`linear-gradient(90deg, ${config.color}88, ${config.color})`}
              borderRadius="2px"
              transition="width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
            />
          </Box>

          <Box display="flex" justifyContent="space-between">
            <Text fontSize="11px" color="rgba(255,255,255,0.3)">0</Text>
            <Text fontSize="12px" color={config.color} fontWeight="600">{affinity}/100</Text>
            <Text fontSize="11px" color="rgba(255,255,255,0.3)">100</Text>
          </Box>

          {/* Memory count */}
          <Box
            mt="12px"
            pt="10px"
            borderTop="1px solid rgba(255,255,255,0.06)"
            display="flex"
            alignItems="center"
            gap="6px"
          >
            <Text fontSize="13px">🧠</Text>
            <Text fontSize="12px" color="rgba(255,255,255,0.5)">记忆中...</Text>
          </Box>
        </Box>
      )}

      {/* Milestone popup */}
      {milestone && (
        <Box
          position="absolute"
          top="100%"
          right="0"
          mt="8px"
          px="14px"
          py="8px"
          bg={`linear-gradient(135deg, ${config.color}dd, ${config.color}99)`}
          borderRadius="16px"
          boxShadow={`0 4px 20px ${config.color}44`}
          whiteSpace="nowrap"
          css={{
            animation: "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            "@keyframes popIn": {
              from: { opacity: 0, transform: "scale(0.8) translateY(-4px)" },
              to: { opacity: 1, transform: "scale(1) translateY(0)" },
            },
          }}
        >
          <Text fontSize="13px" color="white" fontWeight="500">
            ✨ {milestone}
          </Text>
        </Box>
      )}
    </Box>
  );
});

AffinityBadge.displayName = "AffinityBadge";
