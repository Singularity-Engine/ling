/**
 * ws/connection.ts — Core WebSocket connection management.
 *
 * Bottom of the dependency tree: all other ws modules depend on this.
 * Wraps gatewayConnector with session key generation, agent ID detection,
 * and state mapping.
 *
 * Dependency rule: This module MUST NOT import from any sibling ws/* module.
 */

import { gatewayConnector, type GatewayState } from "@/services/gateway-connector";
import { MOBILE_BREAKPOINT } from "@/constants/breakpoints";

// ─── Agent ID detection ──────────────────────────────────────

/** Public site uses restricted agent; local dev uses full agent */
export function getAgentId(): string {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "avatar";
  }
  return "ling-chat";
}

// ─── Session key management ──────────────────────────────────

const OLD_SESSION_KEY = "ling-visitor-session";
function skOldSession(agentId: string): string {
  return `ling-visitor-session:${agentId}`;
}
function skSessionKey(agentId: string): string {
  return `ling-session:${agentId}`;
}

/**
 * Per-visitor session key in Gateway's agent-scoped format: agent:<agentId>:<identifier>
 * - Logged-in user: uses user.id for cross-device session continuity
 * - Guest: uses a random UUID stored in localStorage
 */
export function getVisitorSessionKey(userId?: string | null): string {
  const agentId = getAgentId();
  // Purge old key formats
  localStorage.removeItem(OLD_SESSION_KEY);
  localStorage.removeItem(skOldSession(agentId));

  if (userId) {
    return `agent:${agentId}:user-${userId}`;
  }

  const STORAGE_KEY = skSessionKey(agentId);
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key || !key.startsWith("agent:")) {
    key = `agent:${agentId}:${crypto.randomUUID()}`;
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

// ─── Gateway URL ─────────────────────────────────────────────

export function getDefaultGatewayUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://127.0.0.1:18789";
  }
  return "wss://ws.sngxai.com";
}

// ─── State mapping ───────────────────────────────────────────

/** Map Gateway state to the legacy WS state strings the rest of the app expects */
export function mapGatewayState(state: GatewayState): string {
  switch (state) {
    case "CONNECTED": return "OPEN";
    case "CONNECTING":
    case "HANDSHAKING": return "CONNECTING";
    case "RECONNECTING": return "CONNECTING";
    case "DISCONNECTED": return "CLOSED";
    default: return "CLOSED";
  }
}

// ─── Exports ─────────────────────────────────────────────────

export const isMobileDevice =
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

export { gatewayConnector };
