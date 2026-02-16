import { memo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
const MOD = isMac ? "\u2318" : "Ctrl";

const SHORTCUT_GROUPS = [
  { labelKey: "shortcuts.toggleMic", keys: `${MOD} + M` },
  { labelKey: "shortcuts.focusInput", keys: "/" },
  { labelKey: "shortcuts.toggleChat", keys: `${MOD} + J` },
  { labelKey: "shortcuts.newChat", keys: `${MOD} + K` },
  { labelKey: "shortcuts.showAbout", keys: "Shift + I" },
  { labelKey: "shortcuts.showHelp", keys: "Shift + ?" },
  { labelKey: "shortcuts.closeOverlay", keys: "Esc" },
] as const;

export const ShortcutsOverlay = memo(({ open, onClose }: ShortcutsOverlayProps) => {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "shortcutsFadeIn 0.2s ease-out",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes shortcutsFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shortcutsSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(20, 8, 40, 0.95)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "16px",
          padding: "28px 32px",
          minWidth: "320px",
          maxWidth: "400px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.1)",
          animation: "shortcutsSlideIn 0.25s ease-out",
        }}
      >
        <h2
          style={{
            color: "#c4b5fd",
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "20px",
            textAlign: "center",
            letterSpacing: "0.5px",
          }}
        >
          {t("shortcuts.title")}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {SHORTCUT_GROUPS.map((item) => (
            <div
              key={item.labelKey}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "13px" }}>
                {t(item.labelKey)}
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                {item.keys.split(" + ").map((k) => (
                  <kbd
                    key={k}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "6px",
                      padding: "2px 8px",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      color: "rgba(255, 255, 255, 0.7)",
                      minWidth: "24px",
                      textAlign: "center",
                      lineHeight: "20px",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "20px",
            textAlign: "center",
            fontSize: "11px",
            color: "rgba(139, 92, 246, 0.6)",
          }}
        >
          {t("shortcuts.tip")}
        </div>
      </div>
    </div>
  );
});

ShortcutsOverlay.displayName = "ShortcutsOverlay";
