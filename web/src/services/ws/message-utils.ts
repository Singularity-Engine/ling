/**
 * ws/message-utils.ts — Message normalization and filtering utilities.
 *
 * Depends on: nothing (pure functions)
 * Depended on by: router.ts, websocket-handler.tsx (facade)
 */

import type { Message } from "@/services/websocket-service";

// ─── Internal message detection ─────────────────────────────

const INTERNAL_MESSAGE_PATTERNS = [
  /^\[greeting:experiment\]/,        // Auto-greeting context payload
  /^HEARTBEAT_OK$/,                  // Heartbeat responses
  /^\{[\s]*"status"[\s]*:/,          // Tool result JSON
  /^#\s+\d{4}-\d{2}-\d{2}/,         // Memory file headings
];

export function isInternalMessage(content: string): boolean {
  return INTERNAL_MESSAGE_PATTERNS.some(p => p.test(content));
}

// Roles that are internal Gateway machinery (not user-facing messages)
const INTERNAL_ROLES = new Set(["toolResult", "tool", "system"]);

// ─── Content extraction ─────────────────────────────────────

/** Extract only the user-visible text from a message's content field.
 *  Filters out thinking blocks, tool calls, and tool results — only keeps text parts. */
export function extractVisibleText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter(p => p && typeof p === "object" && p.type === "text")
      .map(p => String(p.text ?? ""))
      .join("");
  }
  if (content == null) return "";
  return String(content);
}

/**
 * Strip gateway-injected metadata prefix from user messages.
 * The gateway wraps every incoming user message with:
 *   Conversation info (untrusted metadata):\n```json\n{...}\n```\n\n[timestamp] actual_text
 * This function extracts just the "actual_text" portion.
 */
export function stripGatewayMeta(text: string): string {
  if (!text.startsWith("Conversation info (untrusted")) return text;
  const match = text.match(/^Conversation info \(untrusted[\s\S]*?\n```\s*\n+(?:\[[^\]]*\]\s?)?/);
  return match ? text.slice(match[0].length).trim() : text;
}

// ─── History normalization ──────────────────────────────────

export function normalizeHistoryMessages(
  raw: Array<{ role: string; content: unknown; timestamp?: string; [k: string]: unknown }>,
): Message[] {
  return raw.filter((m) => {
    if (INTERNAL_ROLES.has(m.role)) return false;
    let c = extractVisibleText(m.content).trim();
    if (!c) return false;
    c = stripGatewayMeta(c);
    if (!c) return false;
    return !isInternalMessage(c);
  }).map((m, i) => ({
    id: String(m.id ?? `hist-${i}-${Date.now()}`),
    role: m.role === "human" || m.role === "user" ? "human" as const : "ai" as const,
    content: stripGatewayMeta(extractVisibleText(m.content)),
    timestamp: (m.timestamp as string) || new Date().toISOString(),
    type: (m.type as "text" | "tool_call_status") || "text",
    name: m.name as string | undefined,
    tool_id: m.tool_id as string | undefined,
    tool_name: m.tool_name as string | undefined,
    status: m.status as "running" | "completed" | "error" | undefined,
  }));
}
