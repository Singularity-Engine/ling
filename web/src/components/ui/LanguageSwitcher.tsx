import { memo, useState, useCallback, useRef, useEffect, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, ensureLanguageLoaded, type SupportedLanguage } from "@/i18n";
import { trackEvent } from "@/lib/analytics";

// ─── Style constants ───

const S_WRAPPER: CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const S_TRIGGER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid var(--ling-purple-30)",
  background: "transparent",
  color: "var(--ling-btn-ghost-color)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.2s, color 0.2s",
};

const S_TRIGGER_OPEN: CSSProperties = {
  ...S_TRIGGER,
  background: "var(--ling-purple-15)",
  color: "var(--ling-text-primary)",
};

const S_DROPDOWN: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: "50%",
  transform: "translateX(-50%)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "4px",
  padding: "8px",
  borderRadius: "12px",
  background: "var(--ling-modal-bg)",
  border: "1px solid var(--ling-modal-border)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px var(--ling-purple-08)",
  zIndex: 10,
  minWidth: "220px",
  animation: "overlayFadeIn 0.15s ease-out",
};

const S_OPTION_BASE: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "none",
  background: "transparent",
  color: "var(--ling-btn-ghost-color)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const S_OPTION_ACTIVE: CSSProperties = {
  ...S_OPTION_BASE,
  background: "var(--ling-purple-30)",
  color: "var(--ling-text-primary)",
};

const ICON_GLOBE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// ─── Component ───

export const LanguageSwitcher = memo(() => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentLang = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : "en";

  const handleSelect = useCallback(async (lng: SupportedLanguage) => {
    const from = currentLang;
    await ensureLanguageLoaded(lng);
    i18n.changeLanguage(lng);
    trackEvent('language_switch', { from, to: lng });
    setOpen(false);
  }, [i18n, currentLang]);

  const toggleOpen = useCallback(() => setOpen(prev => !prev), []);

  // Close on Escape key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapperRef} style={S_WRAPPER}>
      <button
        onClick={toggleOpen}
        style={open ? S_TRIGGER_OPEN : S_TRIGGER}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {ICON_GLOBE}
        {LANGUAGE_NAMES[currentLang]}
      </button>

      {open && (
        <div style={S_DROPDOWN} role="listbox" aria-label={i18n.t("settings.general.language")} onKeyDown={handleKeyDown}>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <button
              key={lng}
              className="ling-lang-option"
              role="option"
              aria-selected={lng === currentLang}
              onClick={() => handleSelect(lng)}
              style={lng === currentLang ? S_OPTION_ACTIVE : S_OPTION_BASE}
            >
              {LANGUAGE_NAMES[lng]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

LanguageSwitcher.displayName = "LanguageSwitcher";
