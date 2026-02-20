/**
 * OpenClaw Gateway WebSocket Connector
 *
 * Implements the Gateway challenge-response handshake protocol
 * and provides a clean interface for sending/receiving messages.
 *
 * Protocol flow:
 *   1. Connect to Gateway WS endpoint
 *   2. Receive connect.challenge event (with nonce)
 *   3. Send connect request (with auth token)
 *   4. Receive hello-ok response
 *   5. Ready for chat.send / agent.event streaming
 */

import { Subject, ReplaySubject, BehaviorSubject } from 'rxjs';

// ─── Types ────────────────────────────────────────────────────────

export type GatewayState = 'DISCONNECTED' | 'CONNECTING' | 'HANDSHAKING' | 'CONNECTED' | 'RECONNECTING';

/** Raw Gateway frame — every WS message is one of these */
export interface GatewayFrame {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string; retryable?: boolean; retryAfterMs?: number };
  event?: string;
  seq?: number;
}

/** Parsed agent event */
export interface GatewayAgentEvent {
  runId: string;
  stream: 'assistant' | 'tool' | 'lifecycle';
  seq: number;
  data: Record<string, unknown>;
}

/** Connect options */
export interface GatewayConnectOptions {
  url: string;
  token: string;
  clientId?: string;
  displayName?: string;
  onStateChange?: (state: GatewayState) => void;
  onAgentEvent?: (event: GatewayAgentEvent) => void;
  onError?: (error: { code: string; message: string }) => void;
  onRawFrame?: (frame: GatewayFrame) => void;
}

// ─── Config ───────────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_RETRIES = 10;
const HANDSHAKE_TIMEOUT_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 90_000; // Treat connection as dead if no tick in 90s
const HEARTBEAT_CHECK_MS = 30_000;   // Check heartbeat every 30s
const IDLE_RETRY_MS = 60_000;        // After max retries exhausted, retry every 60s

// ─── Connector ────────────────────────────────────────────────────

class GatewayConnector {
  private ws: WebSocket | null = null;
  private state: GatewayState = 'DISCONNECTED';
  private options: GatewayConnectOptions | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<string, { resolve: (res: GatewayFrame) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private authFailed = false;
  private instanceId = crypto.randomUUID();
  private connId: string | null = null;
  private lastTickAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idleRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private onVisibilityChange: (() => void) | null = null;

  /** Debug counters */
  readonly debugCounters = { rawFrames: 0, agentEvents: 0, ticks: 0, lastEvent: '' };

  /** Observable for state changes (replay last state for late subscribers) */
  readonly state$ = new ReplaySubject<GatewayState>(1);

  /** Observable for all agent events (no replay — prevents stale event processing on re-subscribe) */
  readonly agentEvent$ = new Subject<GatewayAgentEvent>();

  /** Observable for raw frames (no replay — same reason) */
  readonly rawFrame$ = new Subject<GatewayFrame>();

  /** Fires when a reconnection handshake completes successfully */
  readonly reconnected$ = new Subject<void>();

  /** Current reconnect attempt (0 = not reconnecting) */
  readonly reconnectAttempt$ = new ReplaySubject<number>(1);

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Connect to the Gateway.
   * Resolves when handshake is complete (hello-ok received).
   */
  connect(options: GatewayConnectOptions): Promise<void> {
    this.options = options;
    this.reconnectAttempts = 0;
    this.authFailed = false;
    this.setupVisibilityHandler();
    return this.doConnect();
  }

  /** Disconnect and stop reconnecting */
  disconnect() {
    this.clearReconnectTimer();
    this.stopHeartbeatMonitor();
    this.removeVisibilityHandler();
    this.reconnectAttempts = RECONNECT_MAX_RETRIES; // prevent reconnect
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.setState('DISCONNECTED');
    this.rejectAllPending('Disconnected');
  }

  /** Send a chat message. Returns the request id. */
  async sendChat(sessionKey: string, message: string): Promise<string> {
    const id = crypto.randomUUID();
    await this.sendRequest({
      type: 'req',
      id,
      method: 'chat.send',
      params: {
        sessionKey,
        message,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    return id;
  }

  /** Abort a running agent */
  async abortRun(runId: string): Promise<void> {
    await this.sendRequest({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'chat.abort',
      params: { runId },
    });
  }

  /** List sessions */
  async listSessions(): Promise<GatewayFrame> {
    return this.sendRequest({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.list',
      params: {},
    });
  }

  /** Resolve (create/get) a session */
  async resolveSession(key: string, agentId?: string): Promise<GatewayFrame> {
    return this.sendRequest({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.resolve',
      params: { key, ...(agentId ? { agentId } : {}) },
    });
  }

  /** Get chat history for a session */
  async getChatHistory(sessionKey: string): Promise<GatewayFrame> {
    return this.sendRequest({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'chat.history',
      params: { sessionKey },
    });
  }

  /** Send raw message (escape hatch) */
  sendRaw(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[GatewayConnector] Cannot send, WS not open');
    }
  }

  /**
   * Immediately retry connection (e.g. when browser comes back online).
   * Works in RECONNECTING state (cancels pending timer) and also in
   * DISCONNECTED state (resets retry counter for a fresh attempt).
   */
  retryNow() {
    if (this.state === 'RECONNECTING') {
      this.clearReconnectTimer();
    } else if (this.state === 'DISCONNECTED' && this.options && !this.authFailed) {
      // Set to 1 (not 0) so hello-ok handler detects this as a reconnection
      // and fires reconnected$ — which triggers session re-resolve and UI recovery.
      // Setting to 0 would cause wasReconnecting to be false, skipping recovery.
      this.reconnectAttempts = 1;
    } else {
      return;
    }
    if (import.meta.env.DEV) console.log('[GatewayConnector] retryNow — network recovered, reconnecting immediately');
    this.doConnect().catch((err) => {
      console.error('[GatewayConnector] retryNow failed:', err.message);
    });
  }

  /** Current connection state */
  getState(): GatewayState {
    return this.state;
  }

  /** Whether connected and handshake complete */
  isConnected(): boolean {
    return this.state === 'CONNECTED';
  }

  // ── Private ─────────────────────────────────────────────────────

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.options) {
        reject(new Error('No connection options'));
        return;
      }

      // Clean up any in-progress socket to prevent cross-socket interference.
      // Null out event handlers BEFORE closing so the old onclose doesn't
      // trigger reconnect or rejectAllPending against the new socket.
      if (this.ws) {
        const oldWs = this.ws;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onclose = null;
        oldWs.onerror = null;
        this.ws = null;
        try { oldWs.close(4002, 'Superseded by new connection'); } catch { /* ignore */ }
      }

      this.setState('CONNECTING');

      let ws: WebSocket;
      try {
        ws = new WebSocket(this.options.url);
        this.ws = ws;
      } catch (err) {
        this.setState('DISCONNECTED');
        reject(err);
        return;
      }

      let handshakeResolved = false;

      // Handshake timeout: reject if hello-ok not received within limit
      const handshakeTimer = setTimeout(() => {
        if (!handshakeResolved) {
          handshakeResolved = true;
          ws.close(4000, 'Handshake timeout');
          reject(new Error('Handshake timeout'));
        }
      }, HANDSHAKE_TIMEOUT_MS);

      ws.onopen = () => {
        // Ignore events from a superseded socket
        if (this.ws !== ws) return;
        if (import.meta.env.DEV) console.log('[GatewayConnector] WebSocket open, waiting for challenge...');
        this.setState('HANDSHAKING');
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;

        let frame: GatewayFrame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          console.error('[GatewayConnector] Failed to parse message:', event.data);
          return;
        }

        this.debugCounters.rawFrames++;
        this.rawFrame$.next(frame);
        this.options?.onRawFrame?.(frame);

        // ── Challenge ──
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          if (import.meta.env.DEV) console.log('[GatewayConnector] Challenge received, authenticating...');
          const connectReq: GatewayFrame = {
            type: 'req',
            id: crypto.randomUUID(),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: this.options?.clientId || 'cli',
                displayName: this.options?.displayName || '灵 Avatar',
                version: '1.0.0',
                platform: 'web',
                mode: 'webchat',
                instanceId: this.instanceId,
              },
              caps: [],
              commands: [],
              permissions: {},
              auth: { token: this.options?.token || '' },
              role: 'operator',
              scopes: ['operator.admin'],
            },
          };
          ws.send(JSON.stringify(connectReq));
          return;
        }

        // ── Hello OK ──
        if (frame.type === 'res' && frame.ok === true && (frame.payload as any)?.type === 'hello-ok') {
          this.connId = (frame.payload as any)?.server?.connId || null;
          const wasReconnecting = this.reconnectAttempts > 0;
          this.reconnectAttempts = 0;
          this.reconnectAttempt$.next(0);
          this.lastTickAt = Date.now();
          this.startHeartbeatMonitor();
          this.setState('CONNECTED');
          if (import.meta.env.DEV) console.log(`[GatewayConnector] Connected! connId=${this.connId}`);
          if (wasReconnecting) {
            this.reconnected$.next();
          }
          if (!handshakeResolved) {
            handshakeResolved = true;
            clearTimeout(handshakeTimer);
            resolve();
          }
          return;
        }

        // ── Connect Error (auth failure) ──
        if (frame.type === 'res' && frame.ok === false && !handshakeResolved) {
          const errMsg = frame.error?.message || 'Connection rejected';
          console.error('[GatewayConnector] Handshake failed:', errMsg);
          this.authFailed = true;
          handshakeResolved = true;
          clearTimeout(handshakeTimer);
          reject(new Error(errMsg));
          return;
        }

        // ── Tick (heartbeat) ──
        if (frame.type === 'event' && frame.event === 'tick') {
          this.debugCounters.ticks++;
          this.lastTickAt = Date.now();
          return;
        }

        // ── Agent events ──
        if (frame.type === 'event' && (frame.event === 'agent.event' || frame.event === 'agent')) {
          const payload = frame.payload as any;
          const agentEvent: GatewayAgentEvent = {
            runId: payload?.runId || '',
            stream: payload?.stream || 'lifecycle',
            seq: payload?.seq || 0,
            data: payload?.data || {},
          };
          this.debugCounters.agentEvents++;
          this.debugCounters.lastEvent = `${agentEvent.stream}:${JSON.stringify(agentEvent.data).slice(0, 60)}`;
          if (import.meta.env.DEV) console.log('[GatewayConnector] AGENT EVENT:', agentEvent.stream, agentEvent.data);
          this.agentEvent$.next(agentEvent);
          this.options?.onAgentEvent?.(agentEvent);
          return;
        }

        // ── Request responses ──
        if (frame.type === 'res' && frame.id) {
          const pending = this.pendingRequests.get(frame.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(frame.id);
            if (frame.ok) {
              pending.resolve(frame);
            } else {
              pending.reject(new Error(frame.error?.message || 'Request failed'));
            }
          }
          return;
        }

        // ── Other events ──
        // Forward unhandled events (state updates, etc.)
        if (frame.type === 'event') {
          // Custom events (affinity, emotion, etc.) are forwarded via rawFrame$
          return;
        }
      };

      ws.onclose = (event) => {
        // Ignore close events from superseded sockets
        if (this.ws !== ws && this.ws !== null) return;

        if (import.meta.env.DEV) console.log(`[GatewayConnector] Closed: code=${event.code} reason=${event.reason}`);
        clearTimeout(handshakeTimer);
        this.stopHeartbeatMonitor();
        this.ws = null;
        this.rejectAllPending('Connection closed');

        if (!handshakeResolved) {
          handshakeResolved = true;
          reject(new Error(`WebSocket closed during handshake: ${event.code}`));
        }

        if (this.authFailed) {
          if (import.meta.env.DEV) console.log('[GatewayConnector] Auth failed, not reconnecting');
          this.setState('DISCONNECTED');
        } else if (this.state !== 'DISCONNECTED') {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        console.error('[GatewayConnector] WebSocket error');
        this.options?.onError?.({ code: 'WS_ERROR', message: 'WebSocket connection error' });
      };
    });
  }

  private sendRequest(frame: GatewayFrame): Promise<GatewayFrame> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      const id = frame.id || crypto.randomUUID();

      // Timeout after 30s
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${frame.method} timed out`));
        }
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error('Failed to send'));
      }
    });
  }

  private setState(state: GatewayState) {
    if (this.state !== state) {
      this.state = state;
      this.state$.next(state);
      this.options?.onStateChange?.(state);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= RECONNECT_MAX_RETRIES) {
      if (import.meta.env.DEV) console.log('[GatewayConnector] Max reconnect attempts reached');
      this.setState('DISCONNECTED');
      return;
    }

    this.setState('RECONNECTING');
    const base = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    // Add ±25% jitter to prevent thundering herd on server restart
    const jitter = base * (0.75 + Math.random() * 0.5);
    const delay = Math.round(jitter);
    this.reconnectAttempts++;
    this.reconnectAttempt$.next(this.reconnectAttempts);
    if (import.meta.env.DEV) console.log(`[GatewayConnector] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${RECONNECT_MAX_RETRIES})`);

    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch((err) => {
        console.error('[GatewayConnector] Reconnect failed:', err.message);
      });
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPending(reason: string) {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  // ── Heartbeat monitor ───────────────────────────────────────────

  private startHeartbeatMonitor() {
    this.stopHeartbeatMonitor();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'CONNECTED') return;
      if (this.lastTickAt > 0 && Date.now() - this.lastTickAt > HEARTBEAT_TIMEOUT_MS) {
        console.warn(`[GatewayConnector] Heartbeat timeout — no tick in ${HEARTBEAT_TIMEOUT_MS}ms, closing`);
        this.ws?.close(4001, 'Heartbeat timeout');
      }
    }, HEARTBEAT_CHECK_MS);
  }

  private stopHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Tab visibility handler ──────────────────────────────────────

  private setupVisibilityHandler() {
    this.removeVisibilityHandler();
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.state === 'CONNECTED') {
        // Tab became visible — check if connection went stale while hidden
        if (this.lastTickAt > 0 && Date.now() - this.lastTickAt > HEARTBEAT_TIMEOUT_MS) {
          console.warn('[GatewayConnector] Stale connection detected on tab focus, reconnecting...');
          this.ws?.close(4001, 'Stale after tab resume');
        }
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private removeVisibilityHandler() {
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
  }
}

/** Singleton instance */
export const gatewayConnector = new GatewayConnector();
