import { Box, Text } from "@chakra-ui/react";
import { memo, useState, useMemo } from "react";

interface ToolResultCardProps {
  toolName: string;
  content: string;
  status: string;
}

// 检测 content 中的代码块
function extractCodeBlocks(text: string): { lang: string; code: string }[] {
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  const blocks: { lang: string; code: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ lang: match[1] || "text", code: match[2].trim() });
  }
  return blocks;
}

function getToolCategory(name: string): "code" | "search" | "weather" | "memory" | "generic" {
  const n = name.toLowerCase();
  if (n.includes("search") || n.includes("brave") || n.includes("web")) return "search";
  if (n.includes("weather")) return "weather";
  if (n.includes("memory") || n.includes("remember") || n.includes("recall")) return "memory";
  return "generic";
}

const TOOL_ICONS: Record<string, string> = {
  search: "🔍",
  weather: "🌤️",
  memory: "🧠",
  code: "💻",
  generic: "🔧",
};

const CodeBlock = memo(({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      bg="rgba(0, 0, 0, 0.6)"
      borderRadius="8px"
      overflow="hidden"
      mt="8px"
      border="1px solid rgba(255,255,255,0.08)"
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        px="12px"
        py="6px"
        bg="rgba(255,255,255,0.04)"
        borderBottom="1px solid rgba(255,255,255,0.06)"
      >
        <Text fontSize="11px" color="rgba(139, 92, 246, 0.8)" fontFamily="monospace">
          {lang}
        </Text>
        <Box
          as="button"
          onClick={handleCopy}
          fontSize="11px"
          color="rgba(255,255,255,0.4)"
          cursor="pointer"
          _hover={{ color: "rgba(255,255,255,0.7)" }}
          transition="color 0.2s"
        >
          {copied ? "✓ 已复制" : "复制"}
        </Box>
      </Box>
      <Box
        px="12px"
        py="10px"
        overflowX="auto"
        css={{
          "&::-webkit-scrollbar": { height: "3px" },
          "&::-webkit-scrollbar-thumb": { background: "rgba(139,92,246,0.3)", borderRadius: "2px" },
        }}
      >
        <Text
          as="pre"
          fontSize="12px"
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          color="#e2e8f0"
          whiteSpace="pre"
          lineHeight="1.6"
          m="0"
        >
          {code}
        </Text>
      </Box>
    </Box>
  );
});
CodeBlock.displayName = "CodeBlock";

export const ToolResultCard = memo(({ toolName, content, status }: ToolResultCardProps) => {
  const category = useMemo(() => getToolCategory(toolName), [toolName]);
  const codeBlocks = useMemo(() => extractCodeBlocks(content), [content]);
  const hasCode = codeBlocks.length > 0;
  const icon = TOOL_ICONS[category] || TOOL_ICONS.generic;

  // 去除代码块后的纯文本
  const textContent = hasCode
    ? content.replace(/```\w*\n?[\s\S]*?```/g, "").trim()
    : content;

  const statusIcon = status === "running" ? "⏳" : status === "completed" ? "✅" : "❌";

  // 卡片颜色
  const cardColors: Record<string, { bg: string; border: string; accent: string }> = {
    search: { bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)", accent: "#60a5fa" },
    weather: { bg: "rgba(250, 204, 21, 0.08)", border: "rgba(250, 204, 21, 0.2)", accent: "#facc15" },
    memory: { bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.2)", accent: "#a78bfa" },
    code: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)", accent: "#10b981" },
    generic: { bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.15)", accent: "#8b5cf6" },
  };

  const colors = cardColors[hasCode ? "code" : category] || cardColors.generic;

  return (
    <Box
      bg={colors.bg}
      border={`1px solid ${colors.border}`}
      borderRadius="12px"
      overflow="hidden"
      transition="all 0.3s ease"
      _hover={{ border: `1px solid ${colors.accent}44` }}
    >
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        gap="8px"
        px="14px"
        py="8px"
        borderBottom={textContent || hasCode ? `1px solid ${colors.border}` : "none"}
      >
        <Text fontSize="14px">{icon}</Text>
        <Text fontSize="12px" color={colors.accent} fontWeight="600" flex="1">
          {toolName}
        </Text>
        <Text fontSize="11px" color="rgba(255,255,255,0.4)">
          {statusIcon}
        </Text>
      </Box>

      {/* Content */}
      {(textContent || hasCode) && (
        <Box px="14px" py="10px">
          {textContent && (
            <Text
              fontSize="13px"
              color="rgba(255,255,255,0.75)"
              whiteSpace="pre-wrap"
              lineHeight="1.6"
            >
              {textContent}
            </Text>
          )}
          {codeBlocks.map((block, i) => (
            <CodeBlock key={i} lang={block.lang} code={block.code} />
          ))}
        </Box>
      )}
    </Box>
  );
});

ToolResultCard.displayName = "ToolResultCard";
