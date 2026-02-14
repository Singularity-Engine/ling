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

import { Subject, ReplaySubject } from 'rxjs';

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

  /** Debug counters */
  readonly debugCounters = { rawFrames: 0, agentEvents: 0, ticks: 0, lastEvent: '' };

  /** Observable for state changes (replay last state for late subscribers) */
  readonly state$ = new ReplaySubject<GatewayState>(1);

  /** Observable for all agent events (buffer up to 50 for late subscribers) */
  readonly agentEvent$ = new ReplaySubject<GatewayAgentEvent>(50);

  /** Observable for raw frames (buffer up to 20 for late subscribers) */
  readonly rawFrame$ = new ReplaySubject<GatewayFrame>(20);

  /** Fires when a reconnection handshake completes successfully */
  readonly reconnected$ = new Subject<void>();

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Connect to the Gateway.
   * Resolves when handshake is complete (hello-ok received).
   */
  connect(options: GatewayConnectOptions): Promise<void> {
    this.options = options;
    this.reconnectAttempts = 0;
    this.authFailed = false;
    return this.doConnect();
  }

  /** Disconnect and stop reconnecting */
  disconnect() {
    this.clearReconnectTimer();
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

      this.setState('CONNECTING');

      try {
        this.ws = new WebSocket(this.options.url);
      } catch (err) {
        this.setState('DISCONNECTED');
        reject(err);
        return;
      }

      let handshakeResolved = false;

      this.ws.onopen = () => {
        if (import.meta.env.DEV) console.log('[GatewayConnector] WebSocket open, waiting for challenge...');
        this.setState('HANDSHAKING');
      };

      this.ws.onmessage = (event) => {
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
          this.ws!.send(JSON.stringify(connectReq));
          return;
        }

        // ── Hello OK ──
        if (frame.type === 'res' && frame.ok === true && (frame.payload as any)?.type === 'hello-ok') {
          this.connId = (frame.payload as any)?.server?.connId || null;
          this.reconnectAttempts = 0;
          this.setState('CONNECTED');
          if (import.meta.env.DEV) console.log(`[GatewayConnector] Connected! connId=${this.connId}`);
          if (!handshakeResolved) {
            handshakeResolved = true;
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
          reject(new Error(errMsg));
          return;
        }

        // ── Tick (heartbeat) ──
        if (frame.type === 'event' && frame.event === 'tick') {
          this.debugCounters.ticks++;
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

      this.ws.onclose = (event) => {
        if (import.meta.env.DEV) console.log(`[GatewayConnector] Closed: code=${event.code} reason=${event.reason}`);
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

      this.ws.onerror = () => {
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
      this.ws.send(JSON.stringify(frame));
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
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
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
}

/** Singleton instance */
export const gatewayConnector = new GatewayConnector();
