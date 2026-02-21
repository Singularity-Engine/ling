import { memo, useMemo, useState, useCallback, useRef, type ReactNode, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { toaster } from "@/components/ui/toaster";
import { ToolResultCard } from "./ToolResultCard";

export const remarkPlugins = [remarkGfm];
export const rehypePlugins = [rehypeHighlight];

// Language display names
const LANG_LABELS: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  jsx: "JSX", tsx: "TSX", py: "Python", python: "Python", rb: "Ruby", ruby: "Ruby",
  go: "Go", rust: "Rust", rs: "Rust", java: "Java", cpp: "C++", c: "C", cs: "C#",
  csharp: "C#", swift: "Swift", kotlin: "Kotlin", kt: "Kotlin", php: "PHP",
  sql: "SQL", html: "HTML", css: "CSS", scss: "SCSS", less: "LESS", json: "JSON",
  yaml: "YAML", yml: "YAML", xml: "XML", md: "Markdown", markdown: "Markdown",
  bash: "Bash", sh: "Shell", shell: "Shell", zsh: "Zsh", powershell: "PowerShell",
  ps1: "PowerShell", dockerfile: "Dockerfile", docker: "Docker", toml: "TOML",
  ini: "INI", lua: "Lua", r: "R", dart: "Dart", scala: "Scala", elixir: "Elixir",
  ex: "Elixir", clojure: "Clojure", clj: "Clojure", haskell: "Haskell", hs: "Haskell",
  graphql: "GraphQL", gql: "GraphQL", vue: "Vue", svelte: "Svelte",
  plaintext: "Text", text: "Text", txt: "Text",
};

function extractLang(children: ReactNode): string | null {
  if (!children || typeof children !== "object") return null;
  const child = Array.isArray(children) ? children[0] : children;
  if (!child || typeof child !== "object" || !("props" in child)) return null;
  const cls = (child as { props?: { className?: string } }).props?.className || "";
  const match = cls.match(/language-(\S+)/);
  return match ? match[1] : null;
}

// URL regex for linkifying plain-text user messages.
// Matches http(s) URLs and www. prefixed URLs.
// Capturing group in split → odd-indexed parts are matched URLs.
const URL_RE = /(https?:\/\/[^\s<>)"']+|www\.[^\s<>)"']+)/g;

function linkifyText(text: string): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith("www.") ? `https://${part}` : part;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="user-msg-link">
          {part}
        </a>
      );
    }
    return part;
  });
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (typeof node === "object" && "props" in node) {
    return extractTextContent((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

const CodeBlockHeader = memo(function CodeBlockHeader({ lang, code }: { lang: string | null; code: string }) {
  const [copied, setCopied] = useState(false);
  const label = lang ? (LANG_LABELS[lang.toLowerCase()] || lang) : null;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="code-block-header">
      {label && <span className="code-block-lang">{label}</span>}
      <button onClick={handleCopy} className="code-block-copy" aria-label={copied ? "Copied" : "Copy code"}>
        {copied ? ICON_CHECK : ICON_COPY}
      </button>
    </div>
  );
});
CodeBlockHeader.displayName = "CodeBlockHeader";

function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement> & { children?: ReactNode }) {
  const lang = extractLang(children);
  const code = extractTextContent(children).replace(/\n$/, "");
  return (
    <div className="code-block-wrap">
      <CodeBlockHeader lang={lang} code={code} />
      <pre {...props}>{children}</pre>
    </div>
  );
}

export const mdComponents = {
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  pre: CodeBlock,
};

// ─── Long-message collapse thresholds ───
const COLLAPSE_CHAR_THRESHOLD = 500;
const COLLAPSE_LINE_THRESHOLD = 12;
const COLLAPSED_MAX_HEIGHT = 288; // ~12 lines at 14px * 1.7 line-height

// Inject animation styles once
const STYLE_ID = "chat-bubble-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes bubbleFadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes streamingCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
    @keyframes bubbleCopyFlash { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.97); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
    .chat-copy-btn { opacity: 0; }
    .chat-bubble-wrap:hover .chat-copy-btn { opacity: 1; }
    .chat-copy-btn:hover { color: var(--ling-text-secondary) !important; background: var(--ling-surface) !important; }
    .chat-bubble-ts { opacity: 0; transition: opacity 0.2s ease; }
    .ling-msg-row:hover .chat-bubble-ts { opacity: 1; }
    @media (hover: none) { .chat-copy-btn { opacity: 0.5; } .chat-bubble-ts { opacity: 0.7; } }
    @media (max-width: 768px) { .chat-copy-btn { right: 4px !important; left: auto !important; top: -20px !important; } }
  `;
  document.head.appendChild(style);
}

// ─── Static style constants (avoid per-render allocation across 50+ messages) ───

const S_OUTER_USER: CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: "14px", padding: "0 16px" };
const S_OUTER_AI: CSSProperties = { display: "flex", justifyContent: "flex-start", marginBottom: "14px", padding: "0 16px" };

const S_BUBBLE_USER: CSSProperties = {
  padding: "10px 16px", borderRadius: "18px 18px 4px 18px",
  background: "var(--ling-bubble-user-bg)",
  border: "1px solid var(--ling-bubble-user-border)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  overflow: "hidden", transition: "all 0.2s ease",
  boxShadow: "0 2px 12px var(--ling-bubble-user-shadow)",
};
const S_BUBBLE_AI: CSSProperties = {
  padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
  background: "var(--ling-bubble-ai-bg)",
  border: "1px solid var(--ling-bubble-ai-border)",
  borderLeft: "3px solid var(--ling-bubble-ai-accent)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  overflow: "hidden", transition: "all 0.2s ease",
  boxShadow: "0 1px 8px var(--ling-bubble-ai-shadow)",
};
const S_BUBBLE_AI_ACTIVE: CSSProperties = { ...S_BUBBLE_AI, cursor: "default" };

// Collapsed variants — cap height so Virtuoso handles shorter items in long conversations.
const S_BUBBLE_USER_COLLAPSED: CSSProperties = { ...S_BUBBLE_USER, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };
const S_BUBBLE_AI_COLLAPSED: CSSProperties = { ...S_BUBBLE_AI, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };
const S_BUBBLE_AI_ACTIVE_COLLAPSED: CSSProperties = { ...S_BUBBLE_AI_ACTIVE, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };

const S_USER_TEXT: CSSProperties = {
  fontSize: "14px", color: "var(--ling-text-primary)", whiteSpace: "pre-wrap",
  wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.7, letterSpacing: "0.3px",
};
const S_AI_MD: CSSProperties = { fontSize: "14px", color: "var(--ling-bubble-ai-text)", lineHeight: 1.7, letterSpacing: "0.3px" };

const S_NAME: CSSProperties = {
  display: "block", fontSize: "11px", color: "var(--ling-chat-label)",
  marginBottom: "4px", marginLeft: "4px", fontWeight: 500, letterSpacing: "0.5px",
};
const S_TS_USER: CSSProperties = { display: "block", fontSize: "10px", color: "var(--ling-chat-timestamp)", marginTop: "3px", textAlign: "right", marginRight: "4px" };
const S_TS_AI: CSSProperties = { display: "block", fontSize: "10px", color: "var(--ling-chat-timestamp)", marginTop: "3px", textAlign: "left", marginLeft: "4px" };

const S_COPY_BASE: CSSProperties = {
  position: "absolute", top: "6px", width: "24px", height: "24px",
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", borderRadius: "4px",
  cursor: "pointer", padding: 0, transition: "all 0.2s ease", color: "var(--ling-text-tertiary)",
};
const S_COPY_AI: CSSProperties = { ...S_COPY_BASE, right: "-32px" };
const S_COPY_USER: CSSProperties = { ...S_COPY_BASE, left: "-32px" };
const S_COPY_AI_DONE: CSSProperties = { ...S_COPY_AI, color: "var(--ling-success)" };
const S_COPY_USER_DONE: CSSProperties = { ...S_COPY_USER, color: "var(--ling-success)" };

const S_COLLAPSE_MASK: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, height: "64px",
  background: "var(--ling-collapse-mask-ai)",
  pointerEvents: "none", borderRadius: "0 0 18px 18px",
};
const S_COLLAPSE_MASK_USER: CSSProperties = {
  ...S_COLLAPSE_MASK,
  background: "var(--ling-collapse-mask-user)",
};
const S_TOGGLE_BTN: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
  width: "100%", padding: "6px 0 2px", border: "none", background: "transparent",
  color: "var(--ling-purple-85)", fontSize: "12px", fontWeight: 500,
  cursor: "pointer", letterSpacing: "0.3px", transition: "color 0.2s ease",
};
const S_TOGGLE_ARROW: CSSProperties = { fontSize: "10px" };

const S_TOOL_WRAP: CSSProperties = { padding: "0 16px", marginBottom: "12px", maxWidth: "90%" };
const S_INNER: CSSProperties = { maxWidth: "78%", minWidth: 0 };
const S_REL: CSSProperties = { position: "relative" };
const S_CURSOR: CSSProperties = {
  display: "inline-block", width: "2px", height: "14px", background: "var(--ling-purple)",
  marginLeft: "2px", verticalAlign: "text-bottom", borderRadius: "1px",
  animation: "streamingCursor 1s ease-in-out infinite",
};

// Pre-created SVG icon elements — shared across all ChatBubble & CodeBlockHeader
// instances to avoid redundant React.createElement overhead (50+ bubbles on mount).
const ICON_COPY = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);
const ICON_CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: string;
  isGreeting?: boolean;
  skipEntryAnimation?: boolean;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

export const ChatBubble = memo(({ role, content, timestamp, isStreaming, isToolCall, toolName, toolStatus, isGreeting, skipEntryAnimation }: ChatBubbleProps) => {
  const { t } = useTranslation();
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Capture entry animation once at mount — prevents re-animation when
  // isGreeting changes (user sends first message) and avoids the flash
  // when transitioning from streaming ThinkingBubble to finalized ChatBubble.
  const [entryAnimation] = useState(() => {
    if (skipEntryAnimation) return "none";
    if (isGreeting) return "greetingBubbleIn 0.5s ease-out";
    return "bubbleFadeInUp 0.3s ease-out";
  });

  const [flashing, setFlashing] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(contentRef.current).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const contentRef = useRef(content);
  contentRef.current = content;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const handleDoubleClick = useCallback(() => {
    // Guard: no-op while streaming or when empty
    if (isStreamingRef.current || !contentRef.current) return;
    // Skip if user is selecting text
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    navigator.clipboard.writeText(contentRef.current).then(() => {
      setFlashing(true);
      toaster.create({ title: t("chat.textCopied"), type: "success", duration: 1500 });
      setTimeout(() => setFlashing(false), 350);
    });
  }, [t]);

  // Memoize markdown rendering — ReactMarkdown + plugins are expensive.
  // Avoids re-parsing when only non-content props (isStreaming, etc.) change.
  const renderedMarkdown = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={mdComponents}>
        {content}
      </ReactMarkdown>
    ),
    [content]
  );

  // Determine if the message is long enough to warrant collapsing.
  // Skip during streaming — always show full content while AI is typing.
  const needsCollapse = useMemo(() => {
    if (isStreaming) return false;
    if (content.length > COLLAPSE_CHAR_THRESHOLD) return true;
    const lineCount = content.split("\n").length;
    return lineCount > COLLAPSE_LINE_THRESHOLD;
  }, [content, isStreaming]);

  const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  // Pre-compute styles from module-level constants; only creates new objects
  // when entry animation or flash is active (rare). Avoids ~12 object
  // allocations per render — significant for 50+ messages.
  const outerStyle = useMemo<CSSProperties>(
    () => {
      const base = isUser ? S_OUTER_USER : S_OUTER_AI;
      return entryAnimation === "none" ? base : { ...base, animation: entryAnimation };
    },
    [isUser, entryAnimation]
  );

  const hasContent = !!content;
  const isCollapsed = needsCollapse && !isExpanded;
  const bubbleStyle = useMemo<CSSProperties>(() => {
    if (isUser) return isCollapsed ? S_BUBBLE_USER_COLLAPSED : S_BUBBLE_USER;
    const base = !isStreaming && hasContent
      ? (isCollapsed ? S_BUBBLE_AI_ACTIVE_COLLAPSED : S_BUBBLE_AI_ACTIVE)
      : (isCollapsed ? S_BUBBLE_AI_COLLAPSED : S_BUBBLE_AI);
    return flashing ? { ...base, animation: "bubbleCopyFlash 0.35s ease-out" } : base;
  }, [isUser, isStreaming, hasContent, flashing, isCollapsed]);

  if (isToolCall && toolName) {
    return (
      <div style={S_TOOL_WRAP}>
        <ToolResultCard toolName={toolName} content={content} status={toolStatus || "running"} />
      </div>
    );
  }

  return (
    <div className="ling-msg-row" style={outerStyle}>
      <div style={S_INNER} className="chat-bubble-wrap chat-msg-inner">
        {!isUser && (
          <span style={S_NAME}>
            {t("chat.characterName")}
          </span>
        )}
        <div style={S_REL}>
          <div
            ref={bubbleRef}
            onDoubleClick={handleDoubleClick}
            style={bubbleStyle}
          >
            {isUser ? (
              <span style={S_USER_TEXT}>
                {linkifyText(content)}
              </span>
            ) : (
              <div className="md-content" style={S_AI_MD}>
                {renderedMarkdown}
                {isStreaming && <span style={S_CURSOR} />}
              </div>
            )}
            {isCollapsed && (
              <div style={isUser ? S_COLLAPSE_MASK_USER : S_COLLAPSE_MASK} />
            )}
          </div>
          {needsCollapse && (
            <button onClick={toggleExpand} style={S_TOGGLE_BTN}>
              {isExpanded ? t("chat.showLess") : t("chat.showMore")}
              <span style={S_TOGGLE_ARROW}>{isExpanded ? "▲" : "▼"}</span>
            </button>
          )}
          {!isStreaming && content && (
            <button
              onClick={handleCopy}
              className="chat-copy-btn"
              aria-label={copied ? t("chat.copied") : t("chat.copy")}
              title={copied ? t("chat.copied") : t("chat.copy")}
              style={isUser
                ? (copied ? S_COPY_USER_DONE : S_COPY_USER)
                : (copied ? S_COPY_AI_DONE : S_COPY_AI)}
            >
              {copied ? ICON_CHECK : ICON_COPY}
            </button>
          )}
        </div>
        {timestamp && (
          <span className="chat-bubble-ts" style={isUser ? S_TS_USER : S_TS_AI}>
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
});

ChatBubble.displayName = "ChatBubble";
