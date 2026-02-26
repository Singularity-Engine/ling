import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./OAuthModal.module.css";

interface OAuthModalProps {
  open: boolean;
  onClose: () => void;
}

export const OAuthModal = memo(function OAuthModal({ open, onClose }: OAuthModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus card on open
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const startGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/oauth/google");
      if (!res.ok) throw new Error("OAuth failed");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }, []);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        ref={cardRef}
        tabIndex={-1}
      >
        <h2 className={styles.title}>{t("witness.talkToLing", { defaultValue: "Talk to Ling" })}</h2>
        <button className={styles.googleBtn} onClick={startGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          {loading ? "..." : t("auth.continueWithGoogle", { defaultValue: "Continue with Google" })}
        </button>
        <p className={styles.fallback}>
          <Link to="/login" className={styles.fallbackLink}>
            {t("auth.otherOptions", { defaultValue: "Other sign-in options \u2192" })}
          </Link>
        </p>
      </div>
    </div>
  );
});
