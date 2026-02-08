import { Box } from "@chakra-ui/react";
import { memo } from "react";

/**
 * 三个圆点脉冲动画 — AI 正在思考时显示
 */
export const TypingIndicator = memo(() => {
  return (
    <Box
      display="flex"
      justifyContent="flex-start"
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
        display="flex"
        alignItems="center"
        gap="5px"
        px="18px"
        py="12px"
        borderRadius="18px 18px 18px 4px"
        bg="rgba(255, 255, 255, 0.06)"
        border="1px solid rgba(255, 255, 255, 0.06)"
        backdropFilter="blur(10px)"
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            w="7px"
            h="7px"
            borderRadius="50%"
            bg="rgba(139, 92, 246, 0.7)"
            css={{
              animation: `typingDot 1.4s ease-in-out ${i * 0.16}s infinite`,
              "@keyframes typingDot": {
                "0%, 60%, 100%": {
                  opacity: 0.3,
                  transform: "translateY(0)",
                },
                "30%": {
                  opacity: 1,
                  transform: "translateY(-4px)",
                },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
});

TypingIndicator.displayName = "TypingIndicator";
