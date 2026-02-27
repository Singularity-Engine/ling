import { memo, useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocketState, useWebSocketActions } from "@/context/WebsocketContext";
import { gatewayConnector, RECONNECT_MAX_RETRIES } from "@/services/gateway-connector";

// ── Timing constants ──
const CONNECTED_FADE_START = 1700; // ms — begin fade-out after connection
const CONNECTED_FADE_END = 2000;   // ms — fully hidden after connection

// ── Pre-allocated style constants — eliminate per-render allocations ──
const S_CONTAINER_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "5px 10px",
  background: 'rgba(0, 0, 0, 0.35)',
  backdropFilter: "blur(12px)",
  borderRadius: "16px",
  transition: "border-color 0.4s ease, opacity 0.4s ease",
};

const S_CONTAINER_OPEN: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid var(--ling-surface-border)",
  cursor: "default",
  opacity: 0.7,
  animation: "connFadeIn 0.3s ease-out",
};

const S_CONTAINER_OPEN_CLOSING: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid var(--ling-surface-border)",
  cursor: "default",
  opacity: 0.7,
  animation: "connFadeOut 0.3s ease-in forwards",
};

const S_CONTAINER_CONNECTING: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid var(--ling-surface-border)",
  cursor: "default",
  opacity: 1,
  animation: "connFadeIn 0.3s ease-out",
};

const S_CONTAINER_CLOSED: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid var(--ling-error-border)",
  cursor: "pointer",
  opacity: 1,
  font: "inherit",
  color: "inherit",
};

const S_DOT_BASE: CSSProperties = {
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  flexShrink: 0,
};

// Pre-computed dot styles for each connection state — no per-render allocation
const S_DOT_OPEN: CSSProperties = {
  ...S_DOT_BASE,
  background: "var(--ling-success)",
  boxShadow: "0 0 6px var(--ling-success)88",
};

const S_DOT_CONNECTING: CSSProperties = {
  ...S_DOT_BASE,
  background: "var(--ling-warning)",
  boxShadow: "0 0 6px var(--ling-warning)88",
  animation: "connPulse 1.2s ease-in-out infinite",
};

const S_DOT_IDLE_RETRY: CSSProperties = {
  ...S_DOT_BASE,
  background: "var(--ling-warning)",
  boxShadow: "0 0 6px var(--ling-warning)88",
  animation: "connPulse 2.4s ease-in-out infinite",
};

const S_DOT_CLOSED: CSSProperties = {
  ...S_DOT_BASE,
  background: "var(--ling-error)",
  boxShadow: "0 0 6px var(--ling-error)88",
};

const S_LABEL_ERROR: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-error)",
  fontWeight: 500,
  whiteSpace: "nowrap",
  lineHeight: 1,
};

const S_LABEL_WARNING: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-warning)",
  fontWeight: 500,
  whiteSpace: "nowrap",
  lineHeight: 1,
};

const S_HINT: CSSProperties = {
  fontSize: "10px",
  color: "var(--ling-text-muted)",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/**
 * Minimal connection status indicator.
 * - Connected: tiny green dot, auto-fades after 2s
 * - Connecting/Reconnecting: pulsing amber dot + "重连中..."
 * - Disconnected: red dot + "连接断开" + click-to-retry
 */
// Connected-notification animation phase (eliminates impossible state combinations)
const enum ConnPhase { HIDDEN, VISIBLE, CLOSING }

interface ConnState {
  phase: ConnPhase;
  reconnectAttempt: number;
  idleRetry: boolean;
}

const INIT_STATE: ConnState = { phase: ConnPhase.HIDDEN, reconnectAttempt: 0, idleRetry: false };

export const ConnectionStatus = memo(() => {
  const { t } = useTranslation();
  const { wsState } = useWebSocketState();
  const { reconnect } = useWebSocketActions();
  const [state, setState] = useState<ConnState>(INIT_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isOpen = wsState === "OPEN";
  const isConnecting = wsState === "CONNECTING";
  const isClosed = wsState === "CLOSED";

  const { phase, reconnectAttempt, idleRetry } = state;
  const showConnected = phase !== ConnPhase.HIDDEN;
  const closingConnected = phase === ConnPhase.CLOSING;

  useEffect(() => {
    if (isOpen) {
      setState(prev => ({ ...prev, phase: ConnPhase.VISIBLE }));
      timerRef.current = setTimeout(
        () => setState(prev => ({ ...prev, phase: ConnPhase.CLOSING })),
        CONNECTED_FADE_START,
      );
      closeTimerRef.current = setTimeout(
        () => setState(prev => ({ ...prev, phase: ConnPhase.HIDDEN })),
        CONNECTED_FADE_END,
      );
    } else {
      setState(prev => ({ ...prev, phase: ConnPhase.HIDDEN }));
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    const attemptSub = gatewayConnector.reconnectAttempt$.subscribe(v =>
      setState(prev => ({ ...prev, reconnectAttempt: v })),
    );
    const idleSub = gatewayConnector.inIdleRetry$.subscribe(v =>
      setState(prev => ({ ...prev, idleRetry: v })),
    );
    return () => { attemptSub.unsubscribe(); idleSub.unsubscribe(); };
  }, []);

  if (isOpen && !showConnected) return null;

  const dotStyle = isOpen
    ? S_DOT_OPEN
    : isConnecting
      ? S_DOT_CONNECTING
      : idleRetry
        ? S_DOT_IDLE_RETRY
        : S_DOT_CLOSED;

  const label = isOpen
    ? t("connection.connected")
    : isConnecting
      ? reconnectAttempt > 0
        ? `${t("connection.reconnecting")} (${reconnectAttempt}/${RECONNECT_MAX_RETRIES})`
        : t("connection.reconnecting")
      : idleRetry
        ? t("connection.idleRetry")
        : t("connection.disconnected");

  const containerStyle = isOpen
    ? (closingConnected ? S_CONTAINER_OPEN_CLOSING : S_CONTAINER_OPEN)
    : isClosed
      ? S_CONTAINER_CLOSED
      : S_CONTAINER_CONNECTING;

  const Tag = isClosed ? "button" : "div";

  return (
    <Tag
      {...(isClosed ? { type: "button" as const } : {})}
      onClick={isClosed ? reconnect : undefined}
      style={containerStyle}
      className={isClosed ? "ling-conn-closed" : undefined}
      {...(isClosed
        ? { "aria-label": label }
        : { role: "status" as const, "aria-live": "polite" as const, "aria-label": label })}
    >
      {/* Status dot */}
      <div style={dotStyle} aria-hidden="true" />

      {/* Label */}
      {!isOpen && (
        <span style={isClosed ? S_LABEL_ERROR : S_LABEL_WARNING}>
          {label}
        </span>
      )}

      {/* Click hint for disconnected state */}
      {isClosed && (
        <span style={S_HINT}>
          {t("connection.clickRetry")}
        </span>
      )}
    </Tag>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";
