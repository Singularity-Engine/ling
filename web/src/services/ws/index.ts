/**
 * ws/index.ts — Barrel export for WebSocket sub-modules.
 *
 * Module dependency graph:
 *
 *   connection.ts ← (base, depends on nothing in ws/*)
 *       ↑
 *   message-utils.ts ← (pure functions, no ws/* deps)
 *       ↑
 *   router.ts ← (depends on connection + message-utils) [future]
 *       ↑
 *   ├── tts-pipeline.ts ← depends on connection [future]
 *   ├── asr-handler.ts  ← depends on connection [future]
 *   └── billing.ts      ← independent (event-based) [future]
 *
 * Dependency rule: arrows are one-directional. No circular imports.
 *
 * The facade (websocket-handler.tsx) composes all modules.
 * These sub-modules are extracted for testability and readability.
 */

export {
  getAgentId,
  getVisitorSessionKey,
  getDefaultGatewayUrl,
  mapGatewayState,
  isMobileDevice,
  gatewayConnector,
} from "./connection";

export {
  isInternalMessage,
  extractVisibleText,
  stripGatewayMeta,
  normalizeHistoryMessages,
} from "./message-utils";
