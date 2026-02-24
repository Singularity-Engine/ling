import type { CSSProperties } from "react";

// ─── Static style constants for ChatBubble ───
// Extracted to reduce ChatBubble.tsx size and separate visual definitions
// from component logic. All objects are pre-allocated at module level to
// avoid per-render allocation across 50+ messages.

const COLLAPSED_MAX_HEIGHT = 320; // ~12 lines at 14px * 1.7 line-height + paragraph gaps

// Tighter base gap for same-sender message grouping
export const S_OUTER_USER: CSSProperties = { display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: "var(--ling-space-2)", marginBottom: "var(--ling-space-2)", padding: "0 var(--ling-space-4)" };
export const S_OUTER_AI: CSSProperties = { display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: "var(--ling-space-2)", marginBottom: "var(--ling-space-2)", padding: "0 var(--ling-space-4)" };
// Generous turn separation when speaker changes
export const S_OUTER_USER_GAP: CSSProperties = { ...S_OUTER_USER, marginTop: "var(--ling-space-4)" };
export const S_OUTER_AI_GAP: CSSProperties = { ...S_OUTER_AI, marginTop: "var(--ling-space-4)" };

const S_AVATAR: CSSProperties = {
  width: "28px", height: "28px", borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "var(--ling-font-13)", fontWeight: 600, flexShrink: 0,
  letterSpacing: "0.3px", userSelect: "none", marginTop: "1px",
};
export const S_AVATAR_AI: CSSProperties = { ...S_AVATAR, background: "var(--ling-avatar-ai-bg)", color: "var(--ling-avatar-ai-color)", border: "1.5px solid var(--ling-avatar-ai-color)" };
export const S_AVATAR_USER: CSSProperties = { ...S_AVATAR, background: "var(--ling-avatar-user-bg)", color: "var(--ling-avatar-user-color)" };

export const S_BUBBLE_USER: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 4px 18px",
  background: "var(--ling-bubble-user-bg)",
  border: "1px solid var(--ling-bubble-user-border)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 2px 12px var(--ling-bubble-user-shadow)",
};
export const S_BUBBLE_AI: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 18px 4px",
  background: "var(--ling-bubble-ai-bg)",
  border: "1px solid var(--ling-bubble-ai-border)",
  borderLeft: "3px solid var(--ling-bubble-ai-accent)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 1px 8px var(--ling-bubble-ai-shadow)",
};
export const S_BUBBLE_AI_ACTIVE: CSSProperties = { ...S_BUBBLE_AI, cursor: "default" };

// Collapsed variants — cap height so Virtuoso handles shorter items in long conversations.
export const S_BUBBLE_USER_COLLAPSED: CSSProperties = { ...S_BUBBLE_USER, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };
export const S_BUBBLE_AI_COLLAPSED: CSSProperties = { ...S_BUBBLE_AI, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };
export const S_BUBBLE_AI_ACTIVE_COLLAPSED: CSSProperties = { ...S_BUBBLE_AI_ACTIVE, maxHeight: COLLAPSED_MAX_HEIGHT, position: "relative" };

export const S_USER_TEXT: CSSProperties = {
  fontSize: "var(--ling-font-md)", color: "var(--ling-bubble-user-text)", whiteSpace: "pre-wrap",
  wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.7, letterSpacing: "0.3px",
};
export const S_AI_MD: CSSProperties = { fontSize: "var(--ling-font-md)", color: "var(--ling-bubble-ai-text)", lineHeight: 1.7, letterSpacing: "0.3px" };

export const S_NAME: CSSProperties = {
  display: "block", fontSize: "var(--ling-font-xs)", color: "var(--ling-chat-label)",
  marginBottom: "var(--ling-space-1)", marginLeft: "var(--ling-space-1)", fontWeight: 500, letterSpacing: "0.5px",
};
export const S_NAME_USER: CSSProperties = {
  display: "block", fontSize: "var(--ling-font-xs)", color: "var(--ling-chat-label-user)",
  marginBottom: "var(--ling-space-1)", marginRight: "var(--ling-space-1)", fontWeight: 500, letterSpacing: "0.5px",
  textAlign: "right",
};
export const S_TS_USER: CSSProperties = { display: "block", fontSize: "10px", color: "var(--ling-chat-timestamp)", marginTop: "3px", textAlign: "right", marginRight: "var(--ling-space-1)" };
export const S_TS_AI: CSSProperties = { display: "block", fontSize: "10px", color: "var(--ling-chat-timestamp)", marginTop: "3px", textAlign: "left", marginLeft: "var(--ling-space-1)" };

const S_COPY_BASE: CSSProperties = {
  position: "absolute", top: "2px", width: "var(--ling-space-8)", height: "var(--ling-space-8)",
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", borderRadius: "var(--ling-radius-sm)",
  cursor: "pointer", padding: 0, transition: `opacity var(--ling-duration-fast), color var(--ling-duration-fast), background var(--ling-duration-fast), transform var(--ling-duration-fast)`, color: "var(--ling-text-tertiary)",
};
export const S_COPY_AI: CSSProperties = { ...S_COPY_BASE, right: "-36px" };
export const S_COPY_USER: CSSProperties = { ...S_COPY_BASE, left: "-36px" };
export const S_COPY_AI_DONE: CSSProperties = { ...S_COPY_AI, color: "var(--ling-success)", transform: "scale(1.15)" };
export const S_COPY_USER_DONE: CSSProperties = { ...S_COPY_USER, color: "var(--ling-success)", transform: "scale(1.15)" };

export const S_COLLAPSE_MASK: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, height: "64px",
  background: "var(--ling-collapse-mask-ai)",
  pointerEvents: "none", borderRadius: "0 0 18px 4px",
};
export const S_COLLAPSE_MASK_USER: CSSProperties = {
  ...S_COLLAPSE_MASK,
  background: "var(--ling-collapse-mask-user)",
  borderRadius: "0 0 4px 18px",
};
export const S_TOGGLE_BTN: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--ling-space-1)",
  width: "100%", minHeight: "44px", padding: "10px 0 var(--ling-space-1)", border: "none", background: "transparent",
  color: "var(--ling-purple-85)", fontSize: "var(--ling-font-sm)", fontWeight: 500,
  cursor: "pointer", letterSpacing: "0.3px", transition: `color var(--ling-duration-fast), background var(--ling-duration-fast)`,
  borderRadius: "0 0 var(--ling-radius-lg) var(--ling-radius-lg)",
};
export const S_TOGGLE_ARROW: CSSProperties = { fontSize: "10px" };

export const S_TOOL_WRAP: CSSProperties = { padding: "0 var(--ling-space-4)", marginBottom: "var(--ling-space-3)", maxWidth: "min(90%, 620px)" };
export const S_INNER_USER: CSSProperties = { maxWidth: "min(78%, 560px)", minWidth: 0 };
export const S_INNER_AI: CSSProperties = { maxWidth: "min(82%, 620px)", minWidth: 0 };
export const S_REL: CSSProperties = { position: "relative" };
export const S_CURSOR: CSSProperties = {
  display: "inline-block", width: "2px", height: "var(--ling-font-md)", background: "var(--ling-purple)",
  marginLeft: "2px", verticalAlign: "text-bottom", borderRadius: "1px",
  animation: "streamingCursor 1s ease-in-out infinite",
};

// ── Memory marker styles ──
export const S_MEMORY_MARKER: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "var(--ling-space-1)",
  fontSize: "var(--ling-font-xs)", color: "var(--ling-purple-light)", cursor: "pointer",
  padding: "2px var(--ling-space-2)", borderRadius: "10px",
  background: "var(--ling-purple-08)", border: "1px solid var(--ling-purple-12)",
  marginTop: "var(--ling-radius-sm)", transition: `background var(--ling-duration-fast)`,
  userSelect: "none",
};
export const S_MEMORY_DETAIL: CSSProperties = {
  fontSize: "var(--ling-font-xs)", color: "var(--ling-text-dim)", padding: "var(--ling-radius-sm) 10px",
  background: "var(--ling-purple-05)", borderRadius: "var(--ling-radius-8)",
  marginTop: "var(--ling-space-1)", lineHeight: 1.5,
  animation: "chatFadeInUp 0.2s var(--ling-ease-enter)",
};
