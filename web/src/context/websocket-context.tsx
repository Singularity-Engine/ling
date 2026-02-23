import React, { useContext } from 'react';
import { wsService } from '@/services/websocket-service';
import { SK_OLD_WS_URL, SK_OLD_BASE_URL } from '@/constants/storage-keys';

// 动态判断连接地址
function getDefaultUrls() {
  const hostname = window.location.hostname;

  // 本地开发
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return {
      wsUrl: 'ws://127.0.0.1:12393/client-ws',
      baseUrl: 'http://127.0.0.1:12393',
    };
  }

  // 外网访问 - 通过 lain.sngxai.com 连接数字人后端
  return {
    wsUrl: 'wss://lain.sngxai.com/client-ws',
    baseUrl: 'https://lain.sngxai.com',
  };
}

const { wsUrl: DEFAULT_WS_URL, baseUrl: DEFAULT_BASE_URL } = getDefaultUrls();

// 强制迁移：清除旧的缓存地址（一次性）
if (typeof window !== 'undefined') {
  const cached = localStorage.getItem(SK_OLD_WS_URL);
  if (cached && (cached.includes('classic.sngxai.com') || cached.includes('127.0.0.1'))) {
    localStorage.removeItem(SK_OLD_WS_URL);
    localStorage.removeItem(SK_OLD_BASE_URL);
  }
}

export interface HistoryInfo {
  uid: string;
  latest_message: {
    role: 'human' | 'ai';
    timestamp: string;
    content: string;
  } | null;
  timestamp: string | null;
}

/** Discriminated union of all legacy message types sent via sendMessage. */
export type LegacyMessage =
  | { type: 'text-input'; text: string; images?: unknown[] }
  | { type: 'interrupt-signal'; text?: string }
  | { type: 'mic-audio-data'; audio: number[] }
  | { type: 'mic-audio-end'; images?: unknown[] }
  | { type: 'ai-speak-signal'; idle_time?: number; images?: unknown[] }
  | { type: 'fetch-and-set-history'; history_uid: string }
  | { type: 'create-new-history' }
  | { type: 'fetch-history-list' }
  | { type: 'delete-history'; history_uid: string }
  | { type: 'switch-config'; file: string }
  | { type: 'fetch-configs' }
  | { type: 'fetch-backgrounds' }
  | { type: 'audio-play-start' }
  | { type: 'frontend-playback-complete' }
  | { type: 'request-group-info' }
  | { type: 'add-client-to-group' }
  | { type: 'remove-client-from-group' };

// ─── State context (changes on connect/disconnect/URL change) ────
export interface WebSocketStateProps {
  wsState: string;
  wsUrl: string;
  baseUrl: string;
}

export const WebSocketStateContext = React.createContext<WebSocketStateProps>({
  wsState: 'CLOSED',
  wsUrl: DEFAULT_WS_URL,
  baseUrl: DEFAULT_BASE_URL,
});

// ─── Actions context (stable callbacks, rarely changes) ──────────
export interface WebSocketActionsProps {
  sendMessage: (message: LegacyMessage) => void;
  reconnect: () => void;
  setWsUrl: (url: string) => void;
  setBaseUrl: (url: string) => void;
}

export const WebSocketActionsContext = React.createContext<WebSocketActionsProps>({
  sendMessage: wsService.sendMessage.bind(wsService),
  reconnect: () => wsService.connect(DEFAULT_WS_URL),
  setWsUrl: () => {},
  setBaseUrl: () => {},
});

// ─── Hooks ───────────────────────────────────────────────────────

export function useWebSocketState() {
  return useContext(WebSocketStateContext);
}

export function useWebSocketActions() {
  return useContext(WebSocketActionsContext);
}

/** Combined hook — backward compat for restricted files. */
export function useWebSocket() {
  const state = useContext(WebSocketStateContext);
  const actions = useContext(WebSocketActionsContext);
  return { ...state, ...actions };
}

export const defaultWsUrl = DEFAULT_WS_URL;
export const defaultBaseUrl = DEFAULT_BASE_URL;
