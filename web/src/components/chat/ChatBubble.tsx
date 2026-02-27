import { memo, useMemo, useState, useCallback, useRef, useEffect, Suspense, type ReactNode, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlightLite from "@/utils/rehype-highlight-lite";
import i18next from "i18next";
import { toaster } from "@/components/ui/toaster";
import { lazyRetry } from "@/utils/lazy-retry";
import { ToolResultCard, type ToolStatus } from "./ToolResultCard";
import {
  S_OUTER_USER, S_OUTER_AI, S_OUTER_USER_GAP, S_OUTER_AI_GAP,
  S_AVATAR_AI, S_AVATAR_USER,
  S_BUBBLE_USER, S_BUBBLE_AI, S_BUBBLE_AI_ACTIVE,
  S_BUBBLE_USER_COLLAPSED, S_BUBBLE_AI_COLLAPSED, S_BUBBLE_AI_ACTIVE_COLLAPSED,
  S_USER_TEXT, S_AI_MD, S_NAME, S_NAME_USER, S_TS_USER, S_TS_AI,
  S_COPY_AI, S_COPY_USER, S_COPY_AI_DONE, S_COPY_USER_DONE,
  S_COLLAPSE_MASK, S_COLLAPSE_MASK_USER, S_TOGGLE_BTN, S_TOGGLE_ARROW,
  S_TOOL_WRAP, S_INNER_USER, S_INNER_AI, S_REL, S_CURSOR,
  S_MEMORY_MARKER, S_MEMORY_DETAIL,
} from "./ChatBubble.styles";

const ShareCard = lazyRetry(() => import("./ShareCard").then(m => ({ default: m.ShareCard })));

export const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlightLite];

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

/** Ensure content is always a string — Gateway history may return OpenAI-format arrays
 *  (e.g. [{type:"text", text:"Hello"}] instead of plain "Hello"). */
function normalizeContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text);
        return '';
      })
      .join('');
  }
  if (raw == null) return '';
  return String(raw);
}

// URL regex for linkifying plain-text user messages.
// Matches http(s) URLs and www. prefixed URLs.
// Capturing group in split → odd-indexed parts are matched URLs.
const URL_RE = /(https?:\/\/[^\s<>)"']*[^\s<>)"'.,!?;:]|www\.[^\s<>)"']*[^\s<>)"'.,!?;:])/g;

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
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const label = lang ? (LANG_LABELS[lang.toLowerCase()] || lang) : null;

  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    }, () => {
      toaster.create({ title: i18next.t("chat.copyFailed"), type: "error", duration: 2000 });
    });
  }, [code]);

  return (
    <div className="code-block-header">
      {label && <span className="code-block-lang">{label}</span>}
      <button onClick={handleCopy} className="code-block-copy" aria-label={copied ? i18next.t("chat.copied") : i18next.t("chat.copyCode")}>
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
/** Duration the "copied" feedback icon stays visible before reverting */
const COPY_FEEDBACK_MS = 1500;
// Static person-silhouette icon for user avatar — shared across all instances.
const USER_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

// Pre-created SVG icon elements — shared across all ChatBubble & CodeBlockHeader
// instances to avoid redundant React.createElement overhead (50+ bubbles on mount).
const ICON_COPY = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);
const ICON_CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  toolStatus?: ToolStatus;
  isGreeting?: boolean;
  skipEntryAnimation?: boolean;
  senderChanged?: boolean;
  memoryContext?: string;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);

    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;

    // Future or just now (< 1 min)
    if (diffMin < 1) return i18next.t("time.justNow");
    // < 60 min
    if (diffMin < 60) return i18next.t("time.minutesAgo", { count: diffMin });
    // < 6 hours — show relative hours
    if (diffHr < 6) return i18next.t("time.hoursAgo", { count: diffHr });
    // Same day — show absolute time
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d.getTime() >= today.getTime()) return time;
    // Yesterday
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (d.getTime() >= yesterday.getTime()) return `${i18next.t("time.yesterday")} ${time}`;
    // Older — MM/DD HH:MM
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mo}/${dd} ${time}`;
  } catch {
    return "";
  }
}

// ── Shared tick for relative timestamps ──
// All mounted RelativeTime instances subscribe to a single 15-second interval
// instead of each maintaining its own setTimeout chain. Benefits:
//  1. O(1) timers instead of O(n) per visible message
//  2. React 18 batches all setState calls in one render pass
//  3. setState bails out when the formatted string hasn't changed (most ticks)
const _tickListeners = new Set<() => void>();
let _tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeTimeTick(fn: () => void): () => void {
  _tickListeners.add(fn);
  if (!_tickTimer) {
    _tickTimer = setInterval(() => {
      _tickListeners.forEach(cb => cb());
    }, 15_000);
  }
  return () => {
    _tickListeners.delete(fn);
    if (_tickListeners.size === 0 && _tickTimer) {
      clearInterval(_tickTimer);
      _tickTimer = null;
    }
  };
}

/** Self-updating relative timestamp backed by a shared 15s tick.
 *  Uses useState(displayString) so React skips re-render when the
 *  formatted output hasn't changed — e.g. "3 min ago" stays stable
 *  for ~45s between "2 min ago" and "4 min ago" transitions. */
const RelativeTime = memo(({ timestamp, style }: { timestamp: string; style: CSSProperties }) => {
  const [display, setDisplay] = useState(() => formatTime(timestamp));

  useEffect(() => {
    setDisplay(formatTime(timestamp));
    // Messages older than 6h show absolute time — no updates needed
    if (Date.now() - new Date(timestamp).getTime() > 6 * 3_600_000) return;
    return subscribeTimeTick(() => {
      setDisplay(formatTime(timestamp));
    });
  }, [timestamp]);

  return <span className="chat-bubble-ts" style={style}>{display}</span>;
});
RelativeTime.displayName = "RelativeTime";

export const ChatBubble = memo(({ role, content: rawContent, timestamp, isStreaming, isToolCall, toolName, toolStatus, isGreeting, skipEntryAnimation, senderChanged, memoryContext }: ChatBubbleProps) => {
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const toggleMemory = useCallback(() => setMemoryExpanded(p => !p), []);
  // Normalize content — Gateway history may return array (OpenAI format) instead of string
  const content = normalizeContent(rawContent);
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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { clearTimeout(copyTimerRef.current); clearTimeout(flashTimerRef.current); }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(contentRef.current).then(() => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    }, () => {
      toaster.create({ title: i18next.t("chat.copyFailed"), type: "error", duration: 2000 });
    });
  }, []);

  const contentRef = useRef(content);
  contentRef.current = content;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // ── Share card (AI messages only) ──
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<"menu" | "preview">("menu");
  const closeShare = useCallback(() => { setShareOpen(false); setShareMode("menu"); }, []);

  // Track pointer down position to distinguish taps from scroll gestures
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleBubblePointerDown = useCallback((e: React.PointerEvent) => {
    if (isUser) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, [isUser]);

  const handleBubbleClick = useCallback((e: React.MouseEvent) => {
    if (isUser || isStreamingRef.current || !contentRef.current) return;
    // Don't intercept clicks on interactive elements inside the bubble
    const target = e.target as HTMLElement;
    if (target.closest("a, button, code, pre, .code-block-copy, .chat-copy-btn")) return;
    // Don't open on text selection
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    // Mistouch filter: require ≤5px displacement and ≥200ms hold to distinguish from scroll
    const pd = pointerDownRef.current;
    if (pd) {
      const dx = e.clientX - pd.x;
      const dy = e.clientY - pd.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - pd.t;
      if (dist > 5 || elapsed < 200) return; // scroll gesture or quick tap
    }
    setShareOpen(true);
    setShareMode("menu");
  }, [isUser]);

  const handleDoubleClick = useCallback(() => {
    // Guard: no-op while streaming or when empty
    if (isStreamingRef.current || !contentRef.current) return;
    // Skip if user is selecting text
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    navigator.clipboard.writeText(contentRef.current).then(() => {
      setFlashing(true);
      toaster.create({ title: i18next.t("chat.textCopied"), type: "success", duration: 1500 });
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashing(false), 350);
    }, () => {
      toaster.create({ title: i18next.t("chat.copyFailed"), type: "error", duration: 2000 });
    });
  }, []);

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

  // Memoize linkified user text — avoids re-running URL regex split and
  // re-creating <a> elements on re-render (e.g. when copied/flashing state changes).
  const linkified = useMemo(() => isUser ? linkifyText(content) : null, [isUser, content]);

  // Determine if the message is long enough to warrant collapsing.
  // Skip during streaming — always show full content while AI is typing.
  // Uses charCode scan with early exit instead of split() to avoid
  // allocating a temporary array for long messages.
  const needsCollapse = useMemo(() => {
    if (isStreaming) return false;
    if (content.length > COLLAPSE_CHAR_THRESHOLD) return true;
    let lines = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10 && ++lines > COLLAPSE_LINE_THRESHOLD) return true;
    }
    return false;
  }, [content, isStreaming]);

  const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  // Pre-compute styles from module-level constants; only creates new objects
  // when entry animation or flash is active (rare). Avoids ~12 object
  // allocations per render — significant for 50+ messages.
  const outerStyle = useMemo<CSSProperties>(
    () => {
      const base = isUser
        ? (senderChanged ? S_OUTER_USER_GAP : S_OUTER_USER)
        : (senderChanged ? S_OUTER_AI_GAP : S_OUTER_AI);
      return entryAnimation === "none" ? base : { ...base, animation: entryAnimation };
    },
    [isUser, entryAnimation, senderChanged]
  );

  const hasContent = !!content;
  const isCollapsed = needsCollapse && !isExpanded;
  const bubbleStyle = useMemo<CSSProperties>(() => {
    if (isUser) {
      const base = isCollapsed ? S_BUBBLE_USER_COLLAPSED : S_BUBBLE_USER;
      return flashing ? { ...base, animation: "bubbleCopyFlash 0.35s ease-out" } : base;
    }
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

  const aiInitial = !isUser ? i18next.t("chat.characterName").charAt(0) : "";

  return (
    <div className="ling-msg-row" style={outerStyle} data-voice={isUser ? "world" : "ling"}>
      {!isUser && <div className="ling-avatar" style={S_AVATAR_AI}>{aiInitial}</div>}
      <div style={isUser ? S_INNER_USER : S_INNER_AI} className="chat-bubble-wrap chat-msg-inner">
        {isUser ? (
          <span style={S_NAME_USER}>
            {i18next.t("chat.you")}
          </span>
        ) : (
          <span style={S_NAME}>
            {i18next.t("chat.characterName")}
          </span>
        )}
        <div style={S_REL}>
          <div
            ref={bubbleRef}
            className={isUser ? "ling-bubble ling-bubble-user" : "ling-bubble ling-bubble-ai"}
            onPointerDown={handleBubblePointerDown}
            onDoubleClick={handleDoubleClick}
            onClick={handleBubbleClick}
            style={bubbleStyle}
          >
            {isUser ? (
              <span style={S_USER_TEXT}>
                {linkified}
              </span>
            ) : (
              <div className="md-content" style={S_AI_MD}>
                {renderedMarkdown}
                {isStreaming && <span style={S_CURSOR} aria-hidden="true" />}
              </div>
            )}
            {isCollapsed && (
              <div style={isUser ? S_COLLAPSE_MASK_USER : S_COLLAPSE_MASK} />
            )}
          </div>
          {needsCollapse && (
            <button onClick={toggleExpand} style={S_TOGGLE_BTN} aria-expanded={isExpanded}>
              {isExpanded ? i18next.t("chat.showLess") : i18next.t("chat.showMore")}
              <span aria-hidden="true" style={S_TOGGLE_ARROW}>{isExpanded ? "▲" : "▼"}</span>
            </button>
          )}
          {!isStreaming && content && (
            <button
              onClick={handleCopy}
              className="chat-copy-btn"
              aria-label={copied ? i18next.t("chat.copied") : i18next.t("chat.copy")}
              title={copied ? i18next.t("chat.copied") : i18next.t("chat.copy")}
              style={isUser
                ? (copied ? S_COPY_USER_DONE : S_COPY_USER)
                : (copied ? S_COPY_AI_DONE : S_COPY_AI)}
            >
              {copied ? ICON_CHECK : ICON_COPY}
            </button>
          )}
          {/* Share card action menu (AI messages only) */}
          {!isUser && shareOpen && (
            <Suspense fallback={null}>
              <ShareCard
                content={content}
                isOpen={shareOpen}
                onClose={closeShare}
                mode={shareMode}
                onModeChange={setShareMode}
                triggerRef={bubbleRef}
              />
            </Suspense>
          )}
        </div>
        {/* Memory marker — AI messages based on memory */}
        {!isUser && memoryContext && (
          <>
            <button
              onClick={toggleMemory}
              style={S_MEMORY_MARKER}
              aria-expanded={memoryExpanded}
              aria-label={i18next.t("chat.memoryMarker", "Based on memory")}
            >
              🧠 {i18next.t("chat.remembers", "Remembered")}
            </button>
            {memoryExpanded && (
              <div style={S_MEMORY_DETAIL}>
                {memoryContext}
              </div>
            )}
          </>
        )}
        {timestamp && (
          <RelativeTime timestamp={timestamp} style={isUser ? S_TS_USER : S_TS_AI} />
        )}
      </div>
      {isUser && <div className="ling-avatar" style={S_AVATAR_USER}>{USER_ICON}</div>}
    </div>
  );
});

ChatBubble.displayName = "ChatBubble";
