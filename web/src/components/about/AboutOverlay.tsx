import { memo, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useTranslation } from "react-i18next";
import { useAuthState, useAuthActions } from "@/context/AuthContext";
import { useUIActions } from "@/context/UiContext";
import { apiClient } from "@/services/api-client";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import packageJson from "../../../package.json";
// Keyframes & class styles moved to static index.css — no runtime injection needed.

// ─── Static data ───

interface AboutOverlayProps {
  open: boolean;
  onClose: () => void;
}

const LINKS = [
  {
    labelKey: "about.github",
    url: "https://github.com/Singularity-Engine/ling",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    labelKey: "about.docs",
    url: "https://docs.llmvtuber.com",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
] as const;

const TECH_STACK = "React + Vite + Live2D + WebSocket";

const PLAN_LABELS: Record<string, string> = {
  free: "Spark (Free)",
  stardust: "Stardust",
  resonance: "Resonance",
  eternal: "Eternal",
};

const PLAN_COLORS: Record<string, string> = {
  free: "rgba(255,255,255,0.4)",
  stardust: "#a78bfa",
  resonance: "#7c3aed",
  eternal: "#f59e0b",
};

const EXIT_MS = 200;

// ─── Style constants (avoid per-render allocation) ───

const S_BACKDROP_BASE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--ling-overlay-modal)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
const S_BACKDROP_OPEN: CSSProperties = { ...S_BACKDROP_BASE, animation: "overlayFadeIn 0.2s ease-out" };
const S_BACKDROP_CLOSING: CSSProperties = { ...S_BACKDROP_BASE, animation: `overlayFadeOut ${EXIT_MS}ms ease-in forwards` };

const S_CARD_BASE: CSSProperties = {
  background: "var(--ling-modal-bg)",
  border: "1px solid var(--ling-modal-border)",
  borderRadius: "16px",
  padding: "28px clamp(20px, 5vw, 36px)",
  width: "100%",
  maxWidth: "min(380px, calc(100vw - 32px))",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5), 0 0 40px var(--ling-purple-08)",
  textAlign: "center",
};
const S_CARD_OPEN: CSSProperties = { ...S_CARD_BASE, animation: "overlaySlideIn 0.25s ease-out" };
const S_CARD_CLOSING: CSSProperties = { ...S_CARD_BASE, animation: `overlaySlideOut ${EXIT_MS}ms ease-in forwards` };

const S_PRODUCT_NAME: CSSProperties = {
  color: "var(--ling-purple-text)",
  fontSize: "22px",
  fontWeight: 700,
  marginBottom: "4px",
  letterSpacing: "1px",
};

const S_TAGLINE: CSSProperties = {
  color: "rgba(196, 181, 253, 0.7)",
  fontSize: "13px",
  marginBottom: "20px",
  lineHeight: 1.5,
};

const S_META_COLUMN: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  marginBottom: "20px",
};

const S_META_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const S_VERSION_LABEL: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-placeholder-color)",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const S_VERSION_BADGE: CSSProperties = {
  fontSize: "12px",
  color: "rgba(139, 92, 246, 0.8)",
  background: "var(--ling-purple-12)",
  padding: "2px 10px",
  borderRadius: "10px",
  fontFamily: "monospace",
};

const S_TECH_LABEL: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-text-muted)",
};

const S_DIVIDER: CSSProperties = {
  height: "1px",
  background: "linear-gradient(90deg, transparent, var(--ling-purple-30), transparent)",
  marginBottom: "18px",
};

const S_ACCOUNT_BOX: CSSProperties = {
  marginBottom: "18px",
  padding: "12px 16px",
  background: "var(--ling-btn-ghost-bg)",
  border: "1px solid var(--ling-surface-border)",
  borderRadius: "12px",
  textAlign: "left",
};

const S_ACCOUNT_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "8px",
};

const S_DISPLAY_NAME: CSSProperties = {
  color: "var(--ling-text-soft)",
  fontSize: "13px",
  fontWeight: 600,
};

const S_PLAN_BADGE_BASE: CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
  padding: "2px 8px",
  borderRadius: "6px",
};

// Pre-computed per-plan badge styles (PLAN_COLORS is static, avoids per-render allocation)
const PLAN_BADGE_STYLES: Record<string, CSSProperties> = Object.fromEntries(
  Object.entries(PLAN_COLORS).map(([plan, color]) => [
    plan,
    { ...S_PLAN_BADGE_BASE, color, background: `${color}15` },
  ]),
);

const S_EMAIL: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-text-muted)",
  marginBottom: "10px",
};

const S_BTN_ROW: CSSProperties = {
  display: "flex",
  gap: "8px",
};

const S_BTN_PRIMARY: CSSProperties = {
  flex: 1,
  padding: "6px 12px",
  borderRadius: "8px",
  border: "none",
  background: "var(--ling-purple-50)",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.2s ease, transform 0.15s ease",
};

const S_BTN_MANAGE: CSSProperties = {
  flex: 1,
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid var(--ling-btn-ghost-border)",
  background: "transparent",
  color: "var(--ling-btn-ghost-color)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease",
};

const S_BTN_MANAGE_LOADING: CSSProperties = {
  ...S_BTN_MANAGE,
  opacity: 0.5,
};

const S_BTN_SIGNOUT: CSSProperties = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid var(--ling-surface-border)",
  background: "transparent",
  color: "var(--ling-text-muted)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease",
};

const S_GUEST_BOX: CSSProperties = {
  marginBottom: "18px",
  padding: "12px 16px",
  background: "var(--ling-btn-ghost-bg)",
  border: "1px solid var(--ling-surface-border)",
  borderRadius: "12px",
  textAlign: "center",
};

const S_GUEST_PROMPT: CSSProperties = {
  color: "var(--ling-text-dim)",
  fontSize: "13px",
  margin: "0 0 10px",
};

const S_GUEST_BTN_ROW: CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "center",
};

const S_LOGIN_LINK: CSSProperties = {
  flex: 1,
  padding: "8px 16px",
  borderRadius: "8px",
  border: "none",
  background: "var(--ling-purple-50)",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "center",
  transition: "background 0.2s ease, transform 0.15s ease",
};

const S_REGISTER_LINK: CSSProperties = {
  flex: 1,
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid var(--ling-purple-40)",
  background: "transparent",
  color: "rgba(196, 181, 253, 0.8)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "center",
  transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease",
};

const S_LINKS_ROW: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "10px",
  marginBottom: "18px",
};

const S_LANG_ROW: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "16px",
};

const S_COPYRIGHT: CSSProperties = {
  fontSize: "11px",
  color: "var(--ling-purple-50)",
};

// ─── Component ───

export const AboutOverlay = memo(({ open, onClose }: AboutOverlayProps) => {
  const { t } = useTranslation();
  const { user } = useAuthState();
  const { logout } = useAuthActions();
  const { setPricingOpen } = useUIActions();
  const [portalLoading, setPortalLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus-trap: keep Tab/Shift+Tab within the dialog
  useFocusTrap(dialogRef, open && !closing);

  // Move focus into the dialog when it opens
  useEffect(() => {
    if (open) requestAnimationFrame(() => dialogRef.current?.focus());
  }, [open]);

  // Reset closing state when opened
  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, EXIT_MS);
  }, [onClose, closing]);

  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true);
    try {
      const data = await apiClient.getPortalUrl();
      window.open(data.portal_url, "_blank");
    } catch {
      // If no Stripe account linked, just open pricing
      setPricingOpen(true);
      handleClose();
    } finally {
      setPortalLoading(false);
    }
  }, [setPricingOpen, handleClose]);

  const handleUpgrade = useCallback(() => {
    setPricingOpen(true);
    handleClose();
  }, [setPricingOpen, handleClose]);

  const handleLogout = useCallback(() => {
    logout();
    handleClose();
  }, [logout, handleClose]);

  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    [],
  );

  // ESC to close — handled globally by useKeyboardShortcuts in App.tsx

  if (!open && !closing) return null;

  return (
    <div style={closing ? S_BACKDROP_CLOSING : S_BACKDROP_OPEN} onClick={handleClose}>
      <div ref={dialogRef} tabIndex={-1} onClick={stopPropagation} style={closing ? S_CARD_CLOSING : S_CARD_OPEN} role="dialog" aria-modal="true" aria-labelledby="about-title">
        {/* Product name */}
        <h2 id="about-title" style={S_PRODUCT_NAME}>{t("about.name")}</h2>

        {/* Tagline */}
        <p style={S_TAGLINE}>{t("about.tagline")}</p>

        {/* Version + Tech */}
        <div style={S_META_COLUMN}>
          <div style={S_META_ROW}>
            <span style={S_VERSION_LABEL}>{t("about.version")}</span>
            <span style={S_VERSION_BADGE}>{packageJson.version}</span>
          </div>
          <div style={S_TECH_LABEL}>{TECH_STACK}</div>
        </div>

        {/* Divider */}
        <div style={S_DIVIDER} />

        {/* Account section */}
        {user ? (
          <div style={S_ACCOUNT_BOX}>
            <div style={S_ACCOUNT_HEADER}>
              <span style={S_DISPLAY_NAME}>
                {user.display_name || user.username}
              </span>
              <span
                style={PLAN_BADGE_STYLES[user.plan] || PLAN_BADGE_STYLES.free}
              >
                {PLAN_LABELS[user.plan] || "Free"}
              </span>
            </div>
            <div style={S_EMAIL}>{user.email}</div>
            <div style={S_BTN_ROW}>
              {user.plan === "free" ? (
                <button className="about-btn-primary" onClick={handleUpgrade} style={S_BTN_PRIMARY}>
                  {t("about.upgrade")}
                </button>
              ) : (
                <button
                  className="about-btn-outline"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  aria-busy={portalLoading}
                  style={portalLoading ? S_BTN_MANAGE_LOADING : S_BTN_MANAGE}
                >
                  {portalLoading ? "..." : t("about.manageSubscription")}
                </button>
              )}
              <button className="about-btn-outline" onClick={handleLogout} style={S_BTN_SIGNOUT}>
                {t("about.signOut")}
              </button>
            </div>
          </div>
        ) : (
          <div style={S_GUEST_BOX}>
            <p style={S_GUEST_PROMPT}>{t("about.guestPrompt")}</p>
            <div style={S_GUEST_BTN_ROW}>
              <a className="about-btn-primary" href="/login" style={S_LOGIN_LINK}>
                {t("about.loginButton")}
              </a>
              <a className="about-btn-outline" href="/register" style={S_REGISTER_LINK}>
                {t("about.registerButton")}
              </a>
            </div>
          </div>
        )}

        {/* Links */}
        <div style={S_LINKS_ROW}>
          {LINKS.map((link) => (
            <a
              key={link.labelKey}
              className="about-link"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("about.externalLink", { name: t(link.labelKey) })}
            >
              {link.icon}
              {t(link.labelKey)}
            </a>
          ))}
        </div>

        {/* Language switcher */}
        <div style={S_LANG_ROW}>
          <LanguageSwitcher />
        </div>

        {/* Copyright */}
        <div style={S_COPYRIGHT}>
          © {new Date().getFullYear()} Singularity Engine
        </div>
      </div>
    </div>
  );
});

AboutOverlay.displayName = "AboutOverlay";
