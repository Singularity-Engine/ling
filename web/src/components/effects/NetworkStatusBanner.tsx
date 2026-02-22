import { memo, useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "../../hooks/use-network-status";

// ── Module-level keyframe injection ──
const NET_STYLE_ID = "network-banner-keyframes";
if (typeof document !== "undefined" && !document.getElementById(NET_STYLE_ID)) {
  const el = document.createElement("style");
  el.id = NET_STYLE_ID;
  el.textContent = `
    @keyframes netBannerSlideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes netBannerFadeOut {
      0%, 70% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100%    { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
  `;
  document.head.appendChild(el);
}

// ── Pre-allocated style constants ──
const S_BASE: CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  padding: "8px 20px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const S_OFFLINE: CSSProperties = {
  ...S_BASE,
  background: "rgba(220, 38, 38, 0.75)",
  border: "1px solid rgba(248, 113, 113, 0.4)",
  boxShadow: "0 4px 24px rgba(220, 38, 38, 0.3)",
  animation: "netBannerSlideDown 0.35s ease-out",
};

const S_RECOVERED: CSSProperties = {
  ...S_BASE,
  background: "rgba(22, 163, 74, 0.75)",
  border: "1px solid rgba(74, 222, 128, 0.4)",
  boxShadow: "0 4px 24px rgba(22, 163, 74, 0.3)",
  animation: "netBannerFadeOut 3s ease-out forwards",
};

type Phase = "hidden" | "offline" | "recovered";

export const NetworkStatusBanner = memo(function NetworkStatusBanner() {
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const [phase, setPhase] = useState<Phase>("hidden");
  const wasOffline = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      clearTimeout(timerRef.current);
      setPhase("offline");
    } else if (wasOffline.current) {
      setPhase("recovered");
      timerRef.current = setTimeout(() => setPhase("hidden"), 3000);
    }
    return () => clearTimeout(timerRef.current);
  }, [isOnline]);

  if (phase === "hidden") return null;

  return (
    <div style={phase === "offline" ? S_OFFLINE : S_RECOVERED}>
      {phase === "offline" ? t("network.offline") : t("network.recovered")}
    </div>
  );
});

NetworkStatusBanner.displayName = "NetworkStatusBanner";
