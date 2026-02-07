import { Box, Text } from "@chakra-ui/react";
import { memo, useMemo } from "react";
import { useAffinity } from "@/context/affinity-context";
import { keyframes } from "@emotion/react";

const breathe = keyframes`
  0%, 100% { box-shadow: 0 0 8px var(--glow-color); }
  50% { box-shadow: 0 0 16px var(--glow-color), 0 0 24px var(--glow-color); }
`;

const slideUp = keyframes`
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
`;

const LEVEL_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  hatred: { name: "敌意", color: "#ef4444", icon: "💔" },
  hostile: { name: "冷淡", color: "#f97316", icon: "❄️" },
  indifferent: { name: "无感", color: "#a3a3a3", icon: "😐" },
  neutral: { name: "中立", color: "#60a5fa", icon: "💙" },
  friendly: { name: "友好", color: "#a78bfa", icon: "💜" },
  close: { name: "亲密", color: "#c084fc", icon: "💗" },
  devoted: { name: "挚爱", color: "#f472b6", icon: "💕" },
};

export const AffinityBar = memo(() => {
  const { affinity, level, milestone } = useAffinity();

  const config = useMemo(() => LEVEL_CONFIG[level] || LEVEL_CONFIG.neutral, [level]);

  return (
    <Box
      px="16px"
      py="8px"
      bg="rgba(0, 0, 0, 0.3)"
      backdropFilter="blur(10px)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap="16px"
      position="relative"
      borderTop="1px solid rgba(255,255,255,0.04)"
    >
      <Box display="flex" alignItems="center" gap="10px">
        <Text fontSize="14px" aria-label="affinity icon">
          {config.icon}
        </Text>
        <Text fontSize="12px" color={config.color} fontWeight="600" transition="color 0.5s ease">
          {config.name}
        </Text>
        <Box
          w="100px"
          h="6px"
          bg="rgba(255,255,255,0.08)"
          borderRadius="3px"
          overflow="hidden"
          position="relative"
          style={{ "--glow-color": `${config.color}44` } as React.CSSProperties}
          animation={`${breathe} 3s ease-in-out infinite`}
        >
          <Box
            h="100%"
            w={`${affinity}%`}
            bg={`linear-gradient(90deg, ${config.color}99, ${config.color})`}
            borderRadius="3px"
            transition="width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease"
          />
        </Box>
        <Text fontSize="11px" color="rgba(255,255,255,0.4)" fontFamily="monospace" minW="24px" textAlign="right">
          {affinity}
        </Text>
      </Box>

      <Box w="1px" h="12px" bg="rgba(255,255,255,0.1)" />

      <Box display="flex" alignItems="center" gap="6px">
        <Text fontSize="12px" color="rgba(255,255,255,0.4)">
          🧠
        </Text>
        <Text fontSize="11px" color="rgba(255,255,255,0.35)">
          记忆中...
        </Text>
      </Box>

      {milestone && (
        <Box
          position="absolute"
          bottom="100%"
          left="50%"
          mb="8px"
          bg={`linear-gradient(135deg, ${config.color}dd, ${config.color}99)`}
          px="20px"
          py="8px"
          borderRadius="24px"
          animation={`${slideUp} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)`}
          boxShadow={`0 4px 20px ${config.color}44`}
          whiteSpace="nowrap"
        >
          <Text fontSize="13px" color="white" fontWeight="500">
            ✨ {milestone}
          </Text>
        </Box>
      )}
    </Box>
  );
});

AffinityBar.displayName = "AffinityBar";
