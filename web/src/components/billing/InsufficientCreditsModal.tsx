/**
 * InsufficientCreditsModal - 限额提示弹窗
 *
 * 当用户触达每日消息限额或积分不足时显示。
 * CTA 按钮引导用户查看定价页面。
 */

import { memo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '@/context/ui-context';

const InsufficientCreditsModal: React.FC = memo(function InsufficientCreditsModal() {
  const { t } = useTranslation();
  const { billingModal, closeBillingModal, setPricingOpen } = useUI();

  // ESC to close
  useEffect(() => {
    if (!billingModal.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBillingModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [billingModal.open, closeBillingModal]);

  if (!billingModal.open) return null;

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
    <div
      style={{
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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeBillingModal();
      }}
    >
      <div
        style={{
          background: 'rgba(20, 8, 40, 0.95)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '20px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>

        <h3
          style={{
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
            margin: '0 0 12px',
          }}
        >
          {title}
        </h3>

        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '14px',
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}
        >
          {billingModal.message || defaultMessage}
        </p>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
          }}
        >
          {isGuestLimit ? (
            <a
              href="/register"
              onClick={() => closeBillingModal()}
              style={{
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
              }}
            >
              {t('billing.registerFree')}
            </a>
          ) : (
            <button
              onClick={() => {
                closeBillingModal();
                setPricingOpen(true);
              }}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: 'none',
                background: 'rgba(139, 92, 246, 0.6)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s, opacity 0.2s',
              }}
            >
              {t('billing.viewPlans')}
            </button>
          )}
          <button
            onClick={closeBillingModal}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            {t('billing.maybeLater')}
          </button>
        </div>
      </div>
    </div>
  );
});

export default InsufficientCreditsModal;
