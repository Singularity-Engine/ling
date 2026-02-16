import { memo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "@/context/websocket-context";
import { gatewayConnector } from "@/services/gateway-connector";

const keyframesStyle = `
@keyframes connFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 0.7; transform: translateY(0); }
}
@keyframes connPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}
`;

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
    const sub = gatewayConnector.reconnectAttempt$.subscribe(setReconnectAttempt);
    return () => sub.unsubscribe();
  }, []);

  if (isOpen && !showConnected) return null;

  const dotColor = isOpen
    ? "#4ade80"
    : isConnecting
      ? "#fbbf24"
      : "#f87171";

  const label = isOpen
    ? t("connection.connected")
    : isConnecting
      ? reconnectAttempt > 0
        ? `${t("connection.reconnecting")} (${reconnectAttempt}/10)`
        : t("connection.reconnecting")
      : t("connection.disconnected");

  const Tag = isClosed ? "button" : "div";

  return (
    <>
      <style>{keyframesStyle}</style>
      <Tag
        onClick={isClosed ? reconnect : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 10px",
          background: "rgba(0, 0, 0, 0.35)",
          backdropFilter: "blur(12px)",
          borderRadius: "16px",
          border: `1px solid ${isClosed ? "rgba(248, 113, 113, 0.3)" : "rgba(255,255,255,0.06)"}`,
          cursor: isClosed ? "pointer" : "default",
          transition: "all 0.4s ease",
          opacity: isOpen ? 0.7 : 1,
          animation: isOpen ? "connFadeIn 0.3s ease-out" : undefined,
          // reset button styles
          ...(isClosed ? { font: "inherit", color: "inherit" } : {}),
        }}
        onMouseEnter={(e) => {
          if (isClosed) {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(0, 0, 0, 0.55)";
            el.style.borderColor = "rgba(248, 113, 113, 0.5)";
          }
        }}
        onMouseLeave={(e) => {
          if (isClosed) {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(0, 0, 0, 0.35)";
            el.style.borderColor = "rgba(248, 113, 113, 0.3)";
          }
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}88`,
            flexShrink: 0,
            animation: isConnecting ? "connPulse 1.2s ease-in-out infinite" : undefined,
          }}
        />

        {/* Label */}
        {!isOpen && (
          <span
            style={{
              fontSize: "11px",
              color: isClosed ? "rgba(248, 113, 113, 0.9)" : "rgba(251, 191, 36, 0.9)",
              fontWeight: 500,
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        )}

        {/* Click hint for disconnected state */}
        {isClosed && (
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", lineHeight: 1 }}>
            {t("connection.clickRetry")}
          </span>
        )}
      </Tag>
    </>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";
