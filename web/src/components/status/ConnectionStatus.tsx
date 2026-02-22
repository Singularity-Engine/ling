import { memo, useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "@/context/websocket-context";
import { gatewayConnector, RECONNECT_MAX_RETRIES } from "@/services/gateway-connector";

// ── Module-level keyframe injection (consistent with other components) ──
const CONN_STYLE_ID = "connection-status-keyframes";
if (typeof document !== "undefined" && !document.getElementById(CONN_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = CONN_STYLE_ID;
  style.textContent = `
    @keyframes connFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 0.7; transform: translateY(0); }
    }
    @keyframes connPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
  `;
  document.head.appendChild(style);
}

// ── Pre-allocated style constants — eliminate per-render allocations ──
const S_CONTAINER_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "5px 10px",
  background: "rgba(0, 0, 0, 0.35)",
  backdropFilter: "blur(12px)",
  borderRadius: "16px",
  transition: "border-color 0.4s ease, opacity 0.4s ease",
};

const S_CONTAINER_OPEN: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "default",
  opacity: 0.7,
  animation: "connFadeIn 0.3s ease-out",
};

const S_CONTAINER_CONNECTING: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "default",
  opacity: 1,
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
  color: "rgba(255,255,255,0.35)",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/**
 * Minimal connection status indicator.
 * - Connected: tiny green dot, auto-fades after 2s
 * - Connecting/Reconnecting: pulsing amber dot + "重连中..."
 * - Disconnected: red dot + "连接断开" + click-to-retry
 */
export const ConnectionStatus = memo(() => {
  const { t } = useTranslation();
  const { wsState, reconnect } = useWebSocket();
  const [showConnected, setShowConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [idleRetry, setIdleRetry] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const isOpen = wsState === "OPEN";
  const isConnecting = wsState === "CONNECTING";
  const isClosed = wsState === "CLOSED";

  useEffect(() => {
    if (isOpen) {
      setShowConnected(true);
      timerRef.current = setTimeout(() => setShowConnected(false), 2000);
    } else {
      setShowConnected(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    const attemptSub = gatewayConnector.reconnectAttempt$.subscribe(setReconnectAttempt);
    const idleSub = gatewayConnector.inIdleRetry$.subscribe(setIdleRetry);
    return () => { attemptSub.unsubscribe(); idleSub.unsubscribe(); };
  }, []);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.background = "rgba(0, 0, 0, 0.55)";
    el.style.borderColor = "var(--ling-error)";
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.background = "rgba(0, 0, 0, 0.35)";
    el.style.borderColor = "var(--ling-error-border)";
  }, []);

  if (isOpen && !showConnected) return null;

  const dotColor = isOpen
    ? "var(--ling-success)"
    : isConnecting || (isClosed && idleRetry)
      ? "var(--ling-warning)"
      : "var(--ling-error)";

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
    ? S_CONTAINER_OPEN
    : isClosed
      ? S_CONTAINER_CLOSED
      : S_CONTAINER_CONNECTING;

  const dotAnimation = isConnecting
    ? "connPulse 1.2s ease-in-out infinite"
    : isClosed && idleRetry
      ? "connPulse 2.4s ease-in-out infinite"
      : undefined;

  const Tag = isClosed ? "button" : "div";

  return (
    <>
      <Tag
        onClick={isClosed ? reconnect : undefined}
        style={containerStyle}
        onMouseEnter={isClosed ? handleMouseEnter : undefined}
        onMouseLeave={isClosed ? handleMouseLeave : undefined}
      >
        {/* Status dot */}
        <div
          style={{
            ...S_DOT_BASE,
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}88`,
            animation: dotAnimation,
          }}
        />

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
    </>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";
