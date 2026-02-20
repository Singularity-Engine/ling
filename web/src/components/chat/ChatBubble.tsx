import { memo, useMemo, useState, useCallback, useRef, type ReactNode, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { toaster } from "@/components/ui/toaster";
import { ToolResultCard } from "./ToolResultCard";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

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
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        )}
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

const mdComponents = {
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  pre: CodeBlock,
};

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
    .chat-copy-btn:hover { color: rgba(255,255,255,0.7) !important; background: rgba(255,255,255,0.08) !important; }
    @media (hover: none) { .chat-copy-btn { opacity: 0.5; } }
  `;
  document.head.appendChild(style);
}

// ─── Static style constants (avoid per-render allocation across 50+ messages) ───

const S_OUTER_USER: CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: "12px", padding: "0 16px" };
const S_OUTER_AI: CSSProperties = { display: "flex", justifyContent: "flex-start", marginBottom: "12px", padding: "0 16px" };

const S_BUBBLE_USER: CSSProperties = {
  padding: "10px 16px", borderRadius: "18px 18px 4px 18px",
  background: "linear-gradient(135deg, rgba(139, 92, 246, 0.45), rgba(109, 40, 217, 0.4))",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  overflow: "hidden", transition: "all 0.2s ease",
  boxShadow: "0 2px 12px rgba(139, 92, 246, 0.2)",
};
const S_BUBBLE_AI: CSSProperties = {
  padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  overflow: "hidden", transition: "all 0.2s ease",
  boxShadow: "0 1px 8px rgba(0, 0, 0, 0.1)",
};
const S_BUBBLE_AI_ACTIVE: CSSProperties = { ...S_BUBBLE_AI, cursor: "default" };

const S_USER_TEXT: CSSProperties = {
  fontSize: "14px", color: "rgba(255,255,255,0.95)", whiteSpace: "pre-wrap",
  overflowWrap: "break-word", wordBreak: "break-word", lineHeight: 1.7, letterSpacing: "0.3px",
};
const S_AI_MD: CSSProperties = { fontSize: "14px", color: "rgba(255,255,255,0.88)", lineHeight: 1.7, letterSpacing: "0.3px" };

const S_NAME: CSSProperties = {
  display: "block", fontSize: "11px", color: "rgba(139, 92, 246, 0.6)",
  marginBottom: "4px", marginLeft: "4px", fontWeight: 500, letterSpacing: "0.5px",
};
const S_TS_USER: CSSProperties = { display: "block", fontSize: "10px", color: "rgba(255, 255, 255, 0.5)", marginTop: "3px", textAlign: "right", marginRight: "4px" };
const S_TS_AI: CSSProperties = { display: "block", fontSize: "10px", color: "rgba(255, 255, 255, 0.5)", marginTop: "3px", textAlign: "left", marginLeft: "4px" };

const S_COPY: CSSProperties = {
  position: "absolute", top: "6px", right: "-32px", width: "24px", height: "24px",
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", borderRadius: "4px",
  cursor: "pointer", padding: 0, transition: "all 0.2s ease", color: "rgba(255,255,255,0.3)",
};
const S_COPY_DONE: CSSProperties = { ...S_COPY, color: "rgba(34,197,94,0.8)" };

const S_TOOL_WRAP: CSSProperties = { padding: "0 16px", marginBottom: "10px", maxWidth: "90%" };
const S_INNER: CSSProperties = { maxWidth: "78%", minWidth: 0 };
const S_REL: CSSProperties = { position: "relative" };
const S_CURSOR: CSSProperties = {
  display: "inline-block", width: "2px", height: "14px", background: "#8b5cf6",
  marginLeft: "2px", verticalAlign: "text-bottom", borderRadius: "1px",
  animation: "streamingCursor 1s ease-in-out infinite",
};

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: string;
  staggerIndex?: number;
  isGreeting?: boolean;
  skipEntryAnimation?: boolean;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export const ChatBubble = memo(({ role, content, timestamp, isStreaming, isToolCall, toolName, toolStatus, isGreeting, skipEntryAnimation }: ChatBubbleProps) => {
  const { t } = useTranslation();
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

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
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const handleDoubleClick = useCallback(() => {
    // Skip if user is selecting text
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    navigator.clipboard.writeText(content).then(() => {
      setFlashing(true);
      toaster.create({ title: t("chat.textCopied"), type: "success", duration: 1500 });
      setTimeout(() => setFlashing(false), 350);
    });
  }, [content, t]);

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

  const bubbleStyle = useMemo<CSSProperties>(() => {
    if (isUser) return S_BUBBLE_USER;
    const base = !isStreaming && content ? S_BUBBLE_AI_ACTIVE : S_BUBBLE_AI;
    return flashing ? { ...base, animation: "bubbleCopyFlash 0.35s ease-out" } : base;
  }, [isUser, isStreaming, content, flashing]);

  if (isToolCall && toolName) {
    return (
      <div style={S_TOOL_WRAP}>
        <ToolResultCard toolName={toolName} content={content} status={toolStatus || "running"} />
      </div>
    );
  }

  return (
    <div style={outerStyle}>
      <div style={S_INNER} className={!isUser ? "chat-bubble-wrap" : undefined}>
        {!isUser && (
          <span style={S_NAME}>
            {t("chat.characterName")}
          </span>
        )}
        <div style={S_REL}>
          <div
            ref={bubbleRef}
            onDoubleClick={!isUser && !isStreaming && content ? handleDoubleClick : undefined}
            style={bubbleStyle}
          >
            {isUser ? (
              <span style={S_USER_TEXT}>
                {content}
              </span>
            ) : (
              <div className="md-content" style={S_AI_MD}>
                {renderedMarkdown}
                {isStreaming && <span style={S_CURSOR} />}
              </div>
            )}
          </div>
          {!isUser && !isStreaming && content && (
            <button
              onClick={handleCopy}
              className="chat-copy-btn"
              aria-label={copied ? t("chat.copied") : t("chat.copy")}
              title={copied ? t("chat.copied") : t("chat.copy")}
              style={copied ? S_COPY_DONE : S_COPY}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>
          )}
        </div>
        {timestamp && (
          <span style={isUser ? S_TS_USER : S_TS_AI}>
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
});

ChatBubble.displayName = "ChatBubble";
