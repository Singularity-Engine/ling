import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "../../hooks/use-network-status";

type Phase = "hidden" | "offline" | "recovered";

export function NetworkStatusBanner() {
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

  const isOffline = phase === "offline";

  return (
    <div
      style={{
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
        background: isOffline
          ? "rgba(220, 38, 38, 0.75)"
          : "rgba(22, 163, 74, 0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: isOffline
          ? "1px solid rgba(248, 113, 113, 0.4)"
          : "1px solid rgba(74, 222, 128, 0.4)",
        boxShadow: isOffline
          ? "0 4px 24px rgba(220, 38, 38, 0.3)"
          : "0 4px 24px rgba(22, 163, 74, 0.3)",
        animation: isOffline
          ? "netBannerSlideDown 0.35s ease-out"
          : "netBannerFadeOut 3s ease-out forwards",
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {isOffline ? t("network.offline") : t("network.recovered")}

      <style>{`
        @keyframes netBannerSlideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes netBannerFadeOut {
          0%, 70% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100%    { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
