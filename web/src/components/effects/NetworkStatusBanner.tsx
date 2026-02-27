import { memo, useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
// Keyframes moved to static index.css — no runtime injection needed.

// ── Named constants ──
const BANNER_TOP_PX = 16;
const BANNER_Z_INDEX = 9999;
const BANNER_BLUR_PX = 12;
const RECOVERY_DISPLAY_MS = 3000;

// ── Pre-allocated style constants ──
const S_BASE: CSSProperties = {
  position: "fixed",
  top: BANNER_TOP_PX,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: BANNER_Z_INDEX,
  padding: "8px 20px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  backdropFilter: `blur(${BANNER_BLUR_PX}px)`,
  WebkitBackdropFilter: `blur(${BANNER_BLUR_PX}px)`,
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const S_OFFLINE: CSSProperties = {
  ...S_BASE,
  background: "var(--ling-status-offline-bg)",
  border: "1px solid var(--ling-status-offline-border)",
  boxShadow: "0 4px 24px var(--ling-status-offline-shadow)",
  animation: "netBannerSlideDown 0.35s ease-out",
};

const S_RECOVERED: CSSProperties = {
  ...S_BASE,
  background: "var(--ling-status-recovered-bg)",
  border: "1px solid var(--ling-status-recovered-border)",
  boxShadow: "0 4px 24px var(--ling-status-recovered-shadow)",
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
      timerRef.current = setTimeout(
        () => setPhase("hidden"),
        RECOVERY_DISPLAY_MS,
      );
    }
    return () => clearTimeout(timerRef.current);
  }, [isOnline]);

  if (phase === "hidden") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={phase === "offline" ? S_OFFLINE : S_RECOVERED}
    >
      {phase === "offline" ? t("network.offline") : t("network.recovered")}
    </div>
  );
});

NetworkStatusBanner.displayName = "NetworkStatusBanner";
