import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./OAuthModal.module.css";

/** Allowed OAuth redirect URL prefixes for security validation */
const OAUTH_URL_ALLOWLIST = [
  "https://accounts.google.com/",
  "https://github.com/login/oauth",
];

interface OAuthModalProps {
  open: boolean;
  onClose: () => void;
}

export const OAuthModal = memo(function OAuthModal({ open, onClose }: OAuthModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Reset error when modal opens
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  // Focus trap + save previous focus for restore on close
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    const raf = requestAnimationFrame(() => cardRef.current?.focus());

    const handleTab = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleTab);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", handleTab);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const startOAuth = useCallback(async (provider: "google" | "github") => {
    setLoading(provider);
    setError("");
    try {
      const res = await fetch(`/api/auth/oauth/${provider}`);
      if (res.status === 501) {
        setError(t("auth.oauthNotConfigured", { defaultValue: "OAuth not available. Use email login below." }));
        setLoading(null);
        return;
      }
      if (!res.ok) throw new Error("OAuth failed");
      const data = await res.json();
      if (data.url && OAUTH_URL_ALLOWLIST.some((prefix) => data.url.startsWith(prefix))) {
        window.location.href = data.url;
      } else {
        setError(t("auth.oauthStartFailed", { defaultValue: "Could not start sign-in. Try email login." }));
        setLoading(null);
      }
    } catch {
      setError(t("auth.oauthStartFailed", { defaultValue: "Could not start sign-in. Try email login." }));
      setLoading(null);
    }
  }, [t]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={t("auth.signIn", { defaultValue: "Sign in" })}>
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        ref={cardRef}
        tabIndex={-1}
      >
        <h2 className={styles.title}>{t("witness.signInToTalk", { defaultValue: "Sign in to talk to Ling" })}</h2>

        <div className={styles.oauthRow}>
          <button className={styles.oauthBtn} onClick={() => startOAuth("google")} disabled={loading !== null}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {loading === "google" ? "..." : "Google"}
          </button>
          <button className={styles.oauthBtn} onClick={() => startOAuth("github")} disabled={loading !== null}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            {loading === "github" ? "..." : "GitHub"}
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.divider}>
          <span>{t("auth.orDivider", { defaultValue: "or" })}</span>
        </div>

        <Link to="/auth" className={styles.emailBtn} onClick={onClose}>
          {t("auth.signInWithEmail", { defaultValue: "Sign in with email" })}
        </Link>
      </div>
    </div>
  );
});
