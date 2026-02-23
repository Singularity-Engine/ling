/**
 * InsufficientCreditsModal - 限额提示弹窗
 *
 * 当用户触达每日消息限额或积分不足时显示。
 * CTA 按钮引导用户查看定价页面。
 */

import { memo, useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIState, useUIActions } from '@/context/ui-context';

const EXIT_MS = 200;

// ─── Style constants (avoid per-render allocation) ───

const S_BACKDROP_BASE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
};
const S_BACKDROP_OPEN: CSSProperties = { ...S_BACKDROP_BASE, animation: 'overlayFadeIn 0.2s ease-out' };
const S_BACKDROP_CLOSING: CSSProperties = { ...S_BACKDROP_BASE, animation: `overlayFadeOut ${EXIT_MS}ms ease-in forwards` };

const S_CARD_BASE: CSSProperties = {
  background: 'rgba(20, 8, 40, 0.95)',
  border: '1px solid rgba(139, 92, 246, 0.3)',
  borderRadius: '20px',
  padding: '32px',
  maxWidth: '400px',
  width: '100%',
  textAlign: 'center',
};
const S_CARD_OPEN: CSSProperties = { ...S_CARD_BASE, animation: 'overlaySlideIn 0.25s ease-out' };
const S_CARD_CLOSING: CSSProperties = { ...S_CARD_BASE, animation: `overlaySlideOut ${EXIT_MS}ms ease-in forwards` };

const S_ICON: CSSProperties = {
  fontSize: '48px',
  marginBottom: '16px',
};

const S_TITLE: CSSProperties = {
  color: '#fff',
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 12px',
};

const S_MESSAGE: CSSProperties = {
  color: 'rgba(255,255,255,0.6)',
  fontSize: '14px',
  lineHeight: 1.6,
  margin: '0 0 24px',
};

const S_BTN_ROW: CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
};

const S_BTN_PRIMARY: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '12px',
  border: 'none',
  background: 'rgba(139, 92, 246, 0.6)',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s, opacity 0.2s',
  textDecoration: 'none',
};

const S_BTN_SECONDARY: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.6)',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
};

// ─── Component ───

const InsufficientCreditsModal: React.FC = memo(function InsufficientCreditsModal() {
  const { t } = useTranslation();
  const { billingModal } = useUIState();
  const { closeBillingModal, setPricingOpen } = useUIActions();
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();
  // Track what to do after the exit animation finishes
  const afterCloseRef = useRef<(() => void) | null>(null);

  // ESC to close
  useEffect(() => {
    if (!billingModal.open) return;
    setClosing(false);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [billingModal.open]); // handleDismiss is stable enough via closing guard

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  const startExit = useCallback((afterDone?: () => void) => {
    if (closing) return;
    afterCloseRef.current = afterDone ?? null;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      closeBillingModal();
      afterCloseRef.current?.();
      afterCloseRef.current = null;
    }, EXIT_MS);
  }, [closeBillingModal, closing]);

  const handleDismiss = useCallback(() => startExit(), [startExit]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleDismiss();
    },
    [handleDismiss],
  );

  const handleViewPlans = useCallback(() => {
    startExit(() => setPricingOpen(true));
  }, [startExit, setPricingOpen]);

  if (!billingModal.open && !closing) return null;

  const isDailyLimit = billingModal.reason === 'daily_limit_reached';
  const isToolQuota = billingModal.reason === 'tool_quota_reached';
  const isGuestLimit = billingModal.reason === 'guest_limit';

  const icon = isGuestLimit ? '\u2728' : isDailyLimit ? '\u23F0' : '\u2726';
  const title = isGuestLimit
    ? t('billing.guestLimitTitle')
    : isDailyLimit
      ? t('billing.dailyLimitTitle')
      : isToolQuota
        ? t('billing.toolQuotaTitle')
        : t('billing.insufficientCreditsTitle');
  const defaultMessage = isGuestLimit
    ? t('billing.guestLimitMessage')
    : isDailyLimit
      ? t('billing.dailyLimitMessage')
      : isToolQuota
        ? t('billing.toolQuotaMessage')
        : t('billing.insufficientCreditsMessage');

  return (
    <div style={closing ? S_BACKDROP_CLOSING : S_BACKDROP_OPEN} onClick={handleBackdropClick}>
      <div style={closing ? S_CARD_CLOSING : S_CARD_OPEN} role="dialog" aria-modal="true" aria-labelledby="billing-modal-title">
        <div style={S_ICON}>{icon}</div>

        <h3 id="billing-modal-title" style={S_TITLE}>{title}</h3>

        <p style={S_MESSAGE}>
          {billingModal.message || defaultMessage}
        </p>

        <div style={S_BTN_ROW}>
          {isGuestLimit ? (
            <a href="/register" onClick={handleDismiss} className="ling-billing-primary" style={S_BTN_PRIMARY}>
              {t('billing.registerFree')}
            </a>
          ) : (
            <button onClick={handleViewPlans} className="ling-billing-primary" style={S_BTN_PRIMARY}>
              {t('billing.viewPlans')}
            </button>
          )}
          <button onClick={handleDismiss} className="ling-billing-secondary" style={S_BTN_SECONDARY}>
            {t('billing.maybeLater')}
          </button>
        </div>
      </div>
    </div>
  );
});

export default InsufficientCreditsModal;
