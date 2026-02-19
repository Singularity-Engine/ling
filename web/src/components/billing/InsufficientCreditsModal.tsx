/**
 * InsufficientCreditsModal - 限额提示弹窗
 *
 * 当用户触达每日消息限额或积分不足时显示。
 * CTA 按钮引导用户查看定价页面。
 */

import { useUI, type BillingModalState } from '@/context/ui-context';

const InsufficientCreditsModal: React.FC = () => {
  const { billingModal, closeBillingModal, setPricingOpen } = useUI();

  if (!billingModal.open) return null;

  const isDailyLimit = billingModal.reason === 'daily_limit_reached';
  const isToolQuota = billingModal.reason === 'tool_quota_reached';

  const icon = isDailyLimit ? '\u23F0' : '\u2726'; // clock or sparkle
  const title = isDailyLimit
    ? "You've reached today's limit"
    : isToolQuota
      ? 'Tool quota reached'
      : 'Insufficient credits';
  const defaultMessage = isDailyLimit
    ? "We had a great chat today! Upgrade to keep talking — and I'll remember you forever."
    : isToolQuota
      ? 'Upgrade your plan to use this tool more.'
      : "You're running low on credits. Top up to continue using premium features.";

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
          background: '#1a0a2e',
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
              transition: 'all 0.2s',
            }}
          >
            View Plans
          </button>
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
              transition: 'all 0.2s',
            }}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsufficientCreditsModal;
