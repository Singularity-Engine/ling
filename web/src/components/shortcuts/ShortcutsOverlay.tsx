import { type CSSProperties } from "react";
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { OVERLAY_COLORS } from "@/constants/colors";

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

const EXIT_DURATION = 200; // ms — matches overlayFadeOut/overlaySlideOut

// --- Module-level style constants (no per-render allocations) ---

const S_BACKDROP_BASE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: OVERLAY_COLORS.DARK,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
const S_BACKDROP_OPEN: CSSProperties = { ...S_BACKDROP_BASE, animation: "shortcutsFadeIn 0.2s ease-out" };
const S_BACKDROP_CLOSING: CSSProperties = { ...S_BACKDROP_BASE, animation: `overlayFadeOut ${EXIT_DURATION}ms ease-in forwards` };

const S_CARD_BASE: CSSProperties = {
  background: "var(--ling-surface-deep)",
  border: "1px solid var(--ling-purple-30)",
  borderRadius: "16px",
  padding: "24px 20px",
  width: "100%",
  maxWidth: "min(400px, calc(100vw - 32px))",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5), 0 0 40px var(--ling-purple-08)",
};
const S_CARD_OPEN: CSSProperties = { ...S_CARD_BASE, animation: "shortcutsSlideIn 0.25s ease-out" };
const S_CARD_CLOSING: CSSProperties = { ...S_CARD_BASE, animation: `overlaySlideOut ${EXIT_DURATION}ms ease-in forwards` };

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

const S_LABEL: CSSProperties = { color: "var(--ling-text-secondary)", fontSize: "13px" };

const S_KEY_GROUP: CSSProperties = { display: "flex", gap: "4px" };

const S_KBD: CSSProperties = {
  background: "var(--ling-surface-border)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "6px",
  padding: "2px 8px",
  fontSize: "12px",
  fontFamily: "inherit",
  color: "var(--ling-text-soft)",
  minWidth: "24px",
  textAlign: "center",
  lineHeight: "20px",
};

const S_FOOTER: CSSProperties = {
  marginTop: "20px",
  textAlign: "center",
  fontSize: "11px",
  color: "var(--ling-purple-60)",
};

export const ShortcutsOverlay = memo(({ open, onClose }: ShortcutsOverlayProps) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLDivElement>(null);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, EXIT_DURATION);
  }, [onClose, closing]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  // Reset closing state when re-opened; auto-focus dialog for a11y
  useEffect(() => {
    if (open) {
      setClosing(false);
      requestAnimationFrame(() => cardRef.current?.focus());
    }
  }, [open]);

  // Direct ESC handler as defense-in-depth (also handled globally)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleClose();
  }, [handleClose]);

  if (!open && !closing) return null;

  return (
    <div style={closing ? S_BACKDROP_CLOSING : S_BACKDROP_OPEN} onClick={handleBackdropClick}>
      <div ref={cardRef} tabIndex={-1} onKeyDown={handleKeyDown} onClick={(e) => e.stopPropagation()} style={closing ? S_CARD_CLOSING : S_CARD_OPEN} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
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
