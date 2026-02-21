import { memo, useState, useMemo, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

// Inject scrollbar + animation styles once
const STYLE_ID = "tool-card-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tool-code-scroll::-webkit-scrollbar { height: 3px; }
    .tool-code-scroll::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 2px; }
    @keyframes toolShimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    @keyframes toolPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    @keyframes toolStatusPop {
      0% { transform: scale(0.6); opacity: 0; }
      60% { transform: scale(1.15); }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const COLLAPSE_CHAR_THRESHOLD = 200;
const COLLAPSE_LINE_THRESHOLD = 8;
const CODE_PREVIEW_LINES = 5;

// ─── Static style constants (avoid per-render allocation in tool-heavy conversations) ───

// CodeBlock
const S_CB_OUTER: CSSProperties = {
  background: "rgba(0, 0, 0, 0.6)",
  borderRadius: "8px",
  overflow: "hidden",
  marginTop: "8px",
  border: "1px solid rgba(255,255,255,0.08)",
};
const S_CB_HEADER: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 12px",
  background: "rgba(255,255,255,0.04)",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const S_CB_LANG: CSSProperties = { fontSize: "11px", color: "rgba(139, 92, 246, 0.8)", fontFamily: "monospace" };
const S_CB_COPY: CSSProperties = {
  fontSize: "11px", color: "rgba(255,255,255,0.4)", cursor: "pointer",
  transition: "color 0.2s", background: "none", border: "none", padding: 0,
};
const S_CB_SCROLL: CSSProperties = { padding: "10px 12px", overflowX: "auto" };
const S_CB_PRE: CSSProperties = {
  fontSize: "12px", fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
  color: "#e2e8f0", whiteSpace: "pre", lineHeight: 1.6, margin: 0,
};
const S_CB_EXPAND: CSSProperties = {
  display: "block", width: "100%", padding: "5px 12px", fontSize: "11px",
  color: "rgba(139, 92, 246, 0.8)", background: "rgba(255,255,255,0.02)",
  border: "none", borderTop: "1px solid rgba(255,255,255,0.06)",
  cursor: "pointer", textAlign: "center", transition: "background 0.2s",
};

// StatusIndicator
const S_SI_DOTS: CSSProperties = { display: "inline-flex", gap: "3px", alignItems: "center" };
const S_SI_DONE: CSSProperties = { fontSize: "12px", animation: "toolStatusPop 0.3s ease-out" };
const S_SI_ERROR: CSSProperties = { fontSize: "12px", color: "#f87171", animation: "toolStatusPop 0.3s ease-out" };

// ShimmerBar
const S_SHIMMER: CSSProperties = { height: "2px", overflow: "hidden", position: "relative", background: "rgba(255,255,255,0.04)" };

// ToolResultCard
const S_TC_ICON: CSSProperties = { fontSize: "14px" };
const S_TC_CONTENT: CSSProperties = { padding: "10px 14px" };
const S_TC_COLLAPSED_WRAP: CSSProperties = { padding: "6px 14px 8px" };
const S_TC_COLLAPSED_TEXT: CSSProperties = {
  fontSize: "12px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5,
  overflowWrap: "break-word", wordBreak: "break-word",
};

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

const CodeBlock = memo(({ lang, code, defaultCollapsed }: { lang: string; code: string; defaultCollapsed: boolean }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const lines = code.split("\n");
  const totalLines = lines.length;
  const isLong = totalLines > COLLAPSE_LINE_THRESHOLD;
  const displayCode = collapsed && isLong ? lines.slice(0, CODE_PREVIEW_LINES).join("\n") : code;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div style={S_CB_OUTER}>
      <div style={S_CB_HEADER}>
        <span style={S_CB_LANG}>{lang}</span>
        <button
          onClick={handleCopy}
          aria-label={copied ? t("chat.codeCopied") : t("chat.copyCode")}
          title={t("chat.copyCode")}
          style={S_CB_COPY}
        >
          {copied ? `✓ ${t("chat.copied")}` : t("chat.copy")}
        </button>
      </div>
      <div className="tool-code-scroll" style={S_CB_SCROLL}>
        <pre style={S_CB_PRE}>{displayCode}</pre>
      </div>
      {isLong && (
        <button onClick={() => setCollapsed(c => !c)} style={S_CB_EXPAND}>
          {collapsed
            ? t("chat.toolExpandLines", { count: totalLines - CODE_PREVIEW_LINES })
            : t("chat.toolCollapse")}
        </button>
      )}
    </div>
  );
});
CodeBlock.displayName = "CodeBlock";

/* Status indicator with animation */
const StatusIndicator = memo(({ status, accent }: { status: string; accent: string }) => {
  if (status === "running") {
    return (
      <span style={S_SI_DOTS}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: "4px", height: "4px", borderRadius: "50%",
              background: accent,
              animation: `toolPulse 1s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
    );
  }
  if (status === "completed") {
    return <span style={S_SI_DONE}>✓</span>;
  }
  return <span style={S_SI_ERROR}>✕</span>;
});
StatusIndicator.displayName = "StatusIndicator";

/* Shimmer bar for running state */
const ShimmerBar = memo(({ accent }: { accent: string }) => (
  <div style={S_SHIMMER}>
    <div
      style={{
        position: "absolute", top: 0, left: 0, width: "50%", height: "100%",
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        animation: "toolShimmer 1.5s ease-in-out infinite",
      }}
    />
  </div>
));
ShimmerBar.displayName = "ShimmerBar";

const ERROR_COLORS = { bg: "rgba(248, 113, 113, 0.06)", border: "rgba(248, 113, 113, 0.2)", accent: "#f87171" };

const CARD_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  search: { bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)", accent: "#60a5fa" },
  weather: { bg: "rgba(250, 204, 21, 0.08)", border: "rgba(250, 204, 21, 0.2)", accent: "#facc15" },
  memory: { bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.2)", accent: "#a78bfa" },
  code: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)", accent: "#10b981" },
  generic: { bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.15)", accent: "#8b5cf6" },
};

export const ToolResultCard = memo(({ toolName, content, status }: ToolResultCardProps) => {
  const { t } = useTranslation();
  const category = useMemo(() => getToolCategory(toolName), [toolName]);
  const codeBlocks = useMemo(() => extractCodeBlocks(content), [content]);
  const hasCode = codeBlocks.length > 0;
  const icon = TOOL_ICONS[category] || TOOL_ICONS.generic;

  const textContent = hasCode
    ? content.replace(/```\w*\n?[\s\S]*?```/g, "").trim()
    : content;

  const isLongText = textContent.length > COLLAPSE_CHAR_THRESHOLD;
  const hasContent = !!(textContent || hasCode);
  const isRunning = status === "running";
  const isError = status !== "running" && status !== "completed";

  // Default collapsed if has long content and not running
  const [collapsed, setCollapsed] = useState(isLongText && !isRunning);

  const toggleCollapsed = useCallback(() => {
    if (hasContent) setCollapsed(c => !c);
  }, [hasContent]);

  const colors = isError
    ? ERROR_COLORS
    : CARD_COLORS[hasCode ? "code" : category] || CARD_COLORS.generic;

  // Truncated text for collapsed view
  const displayText = collapsed && isLongText
    ? textContent.slice(0, COLLAPSE_CHAR_THRESHOLD) + "…"
    : textContent;

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
      {/* Header — clickable to toggle collapse */}
      <div
        onClick={toggleCollapsed}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          borderBottom: (!collapsed && hasContent) ? `1px solid ${colors.border}` : "none",
          cursor: hasContent ? "pointer" : "default",
          userSelect: "none",
          transition: "background 0.2s",
        }}
      >
        <span style={{ fontSize: "14px" }}>{icon}</span>
        <span style={{ fontSize: "12px", color: colors.accent, fontWeight: 600, flex: 1 }}>
          {toolName}
        </span>
        <StatusIndicator status={status} accent={colors.accent} />
        {/* Chevron */}
        {hasContent && (
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.3)",
              transition: "transform 0.2s ease",
              transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
              lineHeight: 1,
            }}
          >
            ▼
          </span>
        )}
      </div>

      {/* Shimmer bar when running */}
      {isRunning && <ShimmerBar accent={colors.accent} />}

      {/* Content — hidden when collapsed */}
      {!collapsed && hasContent && (
        <div style={{ padding: "10px 14px" }}>
          {textContent && (
            <span
              style={{
                display: "block",
                fontSize: "13px",
                color: isError ? "rgba(248, 113, 113, 0.85)" : "rgba(255,255,255,0.75)",
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                wordBreak: "break-word",
                lineHeight: 1.6,
              }}
            >
              {displayText}
            </span>
          )}
          {codeBlocks.map((block) => (
            <CodeBlock key={`${block.lang}:${block.code.slice(0, 48)}`} lang={block.lang} code={block.code} defaultCollapsed={block.code.split("\n").length > COLLAPSE_LINE_THRESHOLD} />
          ))}
        </div>
      )}

      {/* Collapsed summary line */}
      {collapsed && hasContent && (
        <div style={{ padding: "6px 14px 8px" }}>
          <span
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.5,
              overflowWrap: "break-word",
              wordBreak: "break-word",
            }}
          >
            {displayText}
          </span>
        </div>
      )}
    </div>
  );
});

ToolResultCard.displayName = "ToolResultCard";
