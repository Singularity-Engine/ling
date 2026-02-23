import { type CSSProperties } from "react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
// Keyframes moved to static index.css — no runtime injection needed.

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

// --- Module-level style constants (no per-render allocations) ---

const S_BACKDROP: CSSProperties = {
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
};

const S_CARD: CSSProperties = {
  background: "rgba(10, 0, 21, 0.95)",
  border: "1px solid rgba(139, 92, 246, 0.3)",
  borderRadius: "16px",
  padding: "24px 20px",
  width: "100%",
  maxWidth: "min(400px, calc(100vw - 32px))",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.1)",
  animation: "shortcutsSlideIn 0.25s ease-out",
};

const S_HEADING: CSSProperties = {
  color: "var(--ling-purple-lighter)",
  fontSize: "16px",
  fontWeight: 600,
  marginBottom: "20px",
  textAlign: "center",
  letterSpacing: "0.5px",
};

const S_LIST: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };

const S_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 0",
};

const S_LABEL: CSSProperties = { color: "rgba(255, 255, 255, 0.8)", fontSize: "13px" };

const S_KEY_GROUP: CSSProperties = { display: "flex", gap: "4px" };

const S_KBD: CSSProperties = {
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
};

const S_FOOTER: CSSProperties = {
  marginTop: "20px",
  textAlign: "center",
  fontSize: "11px",
  color: "rgba(139, 92, 246, 0.6)",
};

export const ShortcutsOverlay = memo(({ open, onClose }: ShortcutsOverlayProps) => {
  const { t } = useTranslation();

  // ESC to close — handled globally by useKeyboardShortcuts in App.tsx

  if (!open) return null;

  return (
    <div style={S_BACKDROP} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={S_CARD} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title" style={S_HEADING}>{t("shortcuts.title")}</h2>

        <div style={S_LIST}>
          {SHORTCUT_GROUPS.map((item) => (
            <div key={item.labelKey} style={S_ROW}>
              <span style={S_LABEL}>{t(item.labelKey)}</span>
              <div style={S_KEY_GROUP}>
                {item.keys.split(" + ").map((k) => (
                  <kbd key={k} style={S_KBD}>{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={S_FOOTER}>{t("shortcuts.tip")}</div>
      </div>
    </div>
  );
});

ShortcutsOverlay.displayName = "ShortcutsOverlay";
