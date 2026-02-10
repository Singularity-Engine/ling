import { memo, useState, useMemo } from "react";

// Inject scrollbar styles once
const STYLE_ID = "tool-card-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tool-code-scroll::-webkit-scrollbar { height: 3px; }
    .tool-code-scroll::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 2px; }
  `;
  document.head.appendChild(style);
}

interface ToolResultCardProps {
  toolName: string;
  content: string;
  status: string;
}

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
    <div
      style={{
        background: "rgba(0, 0, 0, 0.6)",
        borderRadius: "8px",
        overflow: "hidden",
        marginTop: "8px",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span style={{ fontSize: "11px", color: "rgba(139, 92, 246, 0.8)", fontFamily: "monospace" }}>
          {lang}
        </span>
        <button
          onClick={handleCopy}
          aria-label={copied ? "已复制代码" : "复制代码"}
          title="复制代码"
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            transition: "color 0.2s",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>
      <div
        className="tool-code-scroll"
        style={{ padding: "10px 12px", overflowX: "auto" }}
      >
        <pre
          style={{
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: "#e2e8f0",
            whiteSpace: "pre",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {code}
        </pre>
      </div>
    </div>
  );
});
CodeBlock.displayName = "CodeBlock";

export const ToolResultCard = memo(({ toolName, content, status }: ToolResultCardProps) => {
  const category = useMemo(() => getToolCategory(toolName), [toolName]);
  const codeBlocks = useMemo(() => extractCodeBlocks(content), [content]);
  const hasCode = codeBlocks.length > 0;
  const icon = TOOL_ICONS[category] || TOOL_ICONS.generic;

  const textContent = hasCode
    ? content.replace(/```\w*\n?[\s\S]*?```/g, "").trim()
    : content;

  const statusIcon = status === "running" ? "⏳" : status === "completed" ? "✅" : "❌";

  const cardColors: Record<string, { bg: string; border: string; accent: string }> = {
    search: { bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)", accent: "#60a5fa" },
    weather: { bg: "rgba(250, 204, 21, 0.08)", border: "rgba(250, 204, 21, 0.2)", accent: "#facc15" },
    memory: { bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.2)", accent: "#a78bfa" },
    code: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)", accent: "#10b981" },
    generic: { bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.15)", accent: "#8b5cf6" },
  };

  const colors = cardColors[hasCode ? "code" : category] || cardColors.generic;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        overflow: "hidden",
        transition: "all 0.3s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          borderBottom: textContent || hasCode ? `1px solid ${colors.border}` : "none",
        }}
      >
        <span style={{ fontSize: "14px" }}>{icon}</span>
        <span style={{ fontSize: "12px", color: colors.accent, fontWeight: 600, flex: 1 }}>
          {toolName}
        </span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
          {statusIcon}
        </span>
      </div>

      {/* Content */}
      {(textContent || hasCode) && (
        <div style={{ padding: "10px 14px" }}>
          {textContent && (
            <span
              style={{
                display: "block",
                fontSize: "13px",
                color: "rgba(255,255,255,0.75)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {textContent}
            </span>
          )}
          {codeBlocks.map((block, i) => (
            <CodeBlock key={i} lang={block.lang} code={block.code} />
          ))}
        </div>
      )}
    </div>
  );
});

ToolResultCard.displayName = "ToolResultCard";
