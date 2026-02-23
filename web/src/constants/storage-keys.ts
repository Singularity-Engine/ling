/**
 * Centralized localStorage / sessionStorage key definitions.
 *
 * 所有存储键统一在这里定义，避免魔法字符串散落在各文件中。
 * 注意：修改键值会导致用户已有数据丢失，请谨慎操作。
 */

// ─── localStorage ────────────────────────────────────────────────

/** Auth tokens */
export const SK_TOKEN = 'ling_token';
export const SK_REFRESH_TOKEN = 'ling_refresh_token';

/** Gateway / WebSocket connection */
export const SK_GATEWAY_URL = 'gwUrl';
export const SK_BASE_URL = 'baseUrl';
/** Guest session key per agent: `ling-sk-<agentId>` */
export const skSessionKey = (agentId: string) => `ling-sk-${agentId}`;

/** User preferences & onboarding */
export const SK_USER_PREFERENCES = 'ling-user-preferences';
export const SK_ONBOARDING_DONE = 'ling-onboarding-done';
export const SK_VISIT_COUNT = 'ling_visit_count';

/** UI state */
export const SK_THEME = 'ling-theme';
export const SK_IMAGE_COMPRESSION_QUALITY = 'appImageCompressionQuality';
export const SK_IMAGE_MAX_WIDTH = 'appImageMaxWidth';

/** Feature-specific */
export const SK_CONSTELLATION = 'ling-constellation-v1';
export const SK_AFFINITY_STATE = 'ling-affinity-state';

/** i18n (managed by i18next, referenced here for completeness) */
export const SK_LANGUAGE = 'i18nextLng';

// ─── sessionStorage ──────────────────────────────────────────────

/** Landing animation shown this session */
export const SS_VISITED = 'ling-visited';
/** Onboarding completed this session */
export const SS_ONBOARDING_DONE = 'ling-onboarding-done';

// ─── Migration: old keys to remove ──────────────────────────────

/** @deprecated old key formats, cleaned up in getVisitorSessionKey() */
export const SK_OLD_VISITOR_SESSION = 'ling-visitor-session-key';
export const skOldSession = (agentId: string) => `ling-session-${agentId}`;
/** @deprecated old URL cache keys, cleaned up in websocket-context */
export const SK_OLD_WS_URL = 'wsUrl';
export const SK_OLD_BASE_URL = 'baseUrl';
