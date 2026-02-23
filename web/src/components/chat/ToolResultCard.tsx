import { memo, useState, useMemo, useCallback, useRef, useEffect, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

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
  transition: "color 0.2s, transform 0.15s", background: "none", border: "none",
  padding: "6px 8px", minHeight: "32px", borderRadius: "4px",
};
const S_CB_SCROLL: CSSProperties = { padding: "10px 12px", overflowX: "auto" };
const S_CB_PRE: CSSProperties = {
  fontSize: "12px", fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
  color: "#e2e8f0", whiteSpace: "pre", lineHeight: 1.6, margin: 0,
};
const S_CB_EXPAND: CSSProperties = {
  display: "block", width: "100%", padding: "8px 12px", minHeight: "36px", fontSize: "11px",
  color: "rgba(139, 92, 246, 0.8)", background: "rgba(255,255,255,0.02)",
  border: "none", borderTop: "1px solid rgba(255,255,255,0.06)",
  cursor: "pointer", textAlign: "center", transition: "background 0.2s, transform 0.15s",
};

// StatusIndicator
const S_SI_DOTS: CSSProperties = { display: "inline-flex", gap: "3px", alignItems: "center" };
const S_SI_DONE: CSSProperties = { fontSize: "12px", animation: "toolStatusPop 0.3s ease-out" };
const S_SI_ERROR: CSSProperties = { fontSize: "12px", color: "var(--ling-error)", animation: "toolStatusPop 0.3s ease-out" };

// Lazily-cached pulse-dot styles keyed by accent color — avoids creating 3 new
// objects inside .map() on every StatusIndicator render.
const _dotCache = new Map<string, CSSProperties[]>();
function getDotStyles(accent: string): CSSProperties[] {
  let s = _dotCache.get(accent);
  if (!s) {
    s = [0, 1, 2].map(i => ({
      width: "4px", height: "4px", borderRadius: "50%",
      background: accent,
      animation: `toolPulse 1s ease-in-out ${i * 0.2}s infinite`,
    } as CSSProperties));
    _dotCache.set(accent, s);
  }
  return s;
}

// Lazily-cached shimmer inner-bar style keyed by accent color.
const _shimmerCache = new Map<string, CSSProperties>();
function getShimmerInnerStyle(accent: string): CSSProperties {
  let s = _shimmerCache.get(accent);
  if (!s) {
    s = {
      position: "absolute", top: 0, left: 0, width: "50%", height: "100%",
      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      animation: "toolShimmer 1.5s ease-in-out infinite",
    };
    _shimmerCache.set(accent, s);
  }
  return s;
}

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
const S_TC_TEXT: CSSProperties = {
  display: "block", fontSize: "13px", color: "rgba(255,255,255,0.82)",
  whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word", lineHeight: 1.6,
};
const S_TC_TEXT_ERROR: CSSProperties = { ...S_TC_TEXT, color: "rgba(248, 113, 113, 0.85)" };
const S_CHEVRON_OPEN: CSSProperties = {
  fontSize: "10px", color: "rgba(255,255,255,0.3)", transition: "transform 0.2s ease",
  transform: "rotate(180deg)", lineHeight: 1,
};
const S_CHEVRON_CLOSED: CSSProperties = { ...S_CHEVRON_OPEN, transform: "rotate(0deg)" };
const S_NAME_FLEX: CSSProperties = { fontSize: "12px", fontWeight: 600, flex: 1 };

const ERROR_COLORS = { bg: "var(--ling-error-bg)", border: "var(--ling-error-border)", accent: "var(--ling-error)" };

const CARD_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  search: { bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)", accent: "#60a5fa" },
  weather: { bg: "rgba(250, 204, 21, 0.08)", border: "rgba(250, 204, 21, 0.2)", accent: "#facc15" },
  memory: { bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.2)", accent: "#a78bfa" },
  code: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)", accent: "#10b981" },
  generic: { bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.15)", accent: "#8b5cf6" },
};

// Precompute per-category card & header styles — avoids creating new objects in render
function buildCategoryStyles(colors: { bg: string; border: string; accent: string }) {
  const card: CSSProperties = {
    background: colors.bg, border: `1px solid ${colors.border}`,
    borderRadius: "14px", overflow: "hidden", transition: "border-color 0.3s ease, background 0.3s ease",
  };
  const headerBase = {
    display: "flex" as const, alignItems: "center" as const, gap: "8px",
    padding: "10px 14px", minHeight: "44px", userSelect: "none" as const, transition: "background 0.2s",
  };
  const headerExpanded: CSSProperties = { ...headerBase, borderBottom: `1px solid ${colors.border}`, cursor: "pointer" };
  const headerCollapsed: CSSProperties = { ...headerBase, borderBottom: "none", cursor: "pointer" };
  const headerNoContent: CSSProperties = { ...headerBase, borderBottom: "none", cursor: "default" };
  const name: CSSProperties = { ...S_NAME_FLEX, color: colors.accent };
  return { card, headerExpanded, headerCollapsed, headerNoContent, name };
}

const CATEGORY_CARD_STYLES = Object.fromEntries(
  Object.entries(CARD_COLORS).map(([cat, c]) => [cat, buildCategoryStyles(c)])
) as Record<string, ReturnType<typeof buildCategoryStyles>>;
const ERROR_CARD_STYLES = buildCategoryStyles(ERROR_COLORS);

interface ToolResultCardProps {
  toolName: string;
  content: string;
  status: string;
}

const CODE_BLOCK_RE = /```(\w*)\n?([\s\S]*?)```/g;

function extractCodeBlocks(text: string): { lang: string; code: string }[] {
  CODE_BLOCK_RE.lastIndex = 0; // reset stateful regex
  const blocks: { lang: string; code: string }[] = [];
  let match;
  while ((match = CODE_BLOCK_RE.exec(text)) !== null) {
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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const lines = code.split("\n");
  const totalLines = lines.length;
  const isLong = totalLines > COLLAPSE_LINE_THRESHOLD;
  const displayCode = collapsed && isLong ? lines.slice(0, CODE_PREVIEW_LINES).join("\n") : code;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }, () => { /* clipboard denied */ });
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
    const dots = getDotStyles(accent);
    return (
      <span style={S_SI_DOTS}>
        {dots.map((dotStyle, i) => (
          <span key={i} style={dotStyle} />
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
    <div style={getShimmerInnerStyle(accent)} />
  </div>
));
ShimmerBar.displayName = "ShimmerBar";

export const ToolResultCard = memo(({ toolName, content, status }: ToolResultCardProps) => {
  const category = useMemo(() => getToolCategory(toolName), [toolName]);
  const codeBlocks = useMemo(() => extractCodeBlocks(content), [content]);
  const hasCode = codeBlocks.length > 0;
  const icon = TOOL_ICONS[category] || TOOL_ICONS.generic;

  const textContent = useMemo(
    () => hasCode ? content.replace(/```\w*\n?[\s\S]*?```/g, "").trim() : content,
    [content, hasCode],
  );

  const isLongText = textContent.length > COLLAPSE_CHAR_THRESHOLD;
  const hasContent = !!(textContent || hasCode);
  const isRunning = status === "running";
  const isError = status !== "running" && status !== "completed";

  // Default collapsed if has long content and not running
  const [collapsed, setCollapsed] = useState(isLongText && !isRunning);

  const toggleCollapsed = useCallback(() => {
    if (hasContent) setCollapsed(c => !c);
  }, [hasContent]);

  const colorKey = hasCode ? "code" : category;
  const colors = isError ? ERROR_COLORS : (CARD_COLORS[colorKey] || CARD_COLORS.generic);
  const styles = isError ? ERROR_CARD_STYLES : (CATEGORY_CARD_STYLES[colorKey] || CATEGORY_CARD_STYLES.generic);

  // Truncated text for collapsed view
  const displayText = collapsed && isLongText
    ? textContent.slice(0, COLLAPSE_CHAR_THRESHOLD) + "…"
    : textContent;

  const headerStyle = !hasContent
    ? styles.headerNoContent
    : (!collapsed ? styles.headerExpanded : styles.headerCollapsed);

  return (
    <div style={styles.card}>
      {/* Header — clickable to toggle collapse */}
      <div onClick={toggleCollapsed} style={headerStyle}>
        <span style={S_TC_ICON}>{icon}</span>
        <span style={styles.name}>{toolName}</span>
        <StatusIndicator status={status} accent={colors.accent} />
        {hasContent && (
          <span style={collapsed ? S_CHEVRON_CLOSED : S_CHEVRON_OPEN}>▼</span>
        )}
      </div>

      {/* Shimmer bar when running */}
      {isRunning && <ShimmerBar accent={colors.accent} />}

      {/* Content — hidden when collapsed */}
      {!collapsed && hasContent && (
        <div style={S_TC_CONTENT}>
          {textContent && (
            <span style={isError ? S_TC_TEXT_ERROR : S_TC_TEXT}>{displayText}</span>
          )}
          {codeBlocks.map((block) => (
            <CodeBlock key={`${block.lang}:${block.code.slice(0, 48)}`} lang={block.lang} code={block.code} defaultCollapsed={block.code.split("\n").length > COLLAPSE_LINE_THRESHOLD} />
          ))}
        </div>
      )}

      {/* Collapsed summary line */}
      {collapsed && hasContent && (
        <div style={S_TC_COLLAPSED_WRAP}>
          <span style={S_TC_COLLAPSED_TEXT}>{displayText}</span>
        </div>
      )}
    </div>
  );
});

ToolResultCard.displayName = "ToolResultCard";
