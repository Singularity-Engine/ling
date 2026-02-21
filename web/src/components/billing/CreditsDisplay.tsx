/**
 * CreditsDisplay - 积分余额显示组件
 *
 * 显示在界面右上角，展示当前用户的积分余额。
 * owner/admin 和 free 用户不显示。
 */

import { useAuth } from '@/context/auth-context';
import { useUI } from '@/context/ui-context';

const CreditsDisplay: React.FC = () => {
  const { user } = useAuth();
  const { setPricingOpen } = useUI();

  if (!user) return null;

  // owner/admin 不显示积分
  if (user.role === 'owner' || user.role === 'admin') return null;

  // free 用户不显示积分（不扣积分）
  if (!user.plan || user.plan === 'free') return null;

  const balance = user.credits_balance ?? 0;
  const isLow = balance <= 10;

  return (
    <button
      onClick={() => setPricingOpen(true)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '9999px',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      title={`Credits: ${balance}`}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: isLow ? 'var(--ling-error)' : 'rgba(168, 85, 247, 0.9)',
        }}
      >
        ✦
      </span>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: isLow ? 'var(--ling-error)' : 'rgba(255, 255, 255, 0.8)',
        }}
      >
        {Math.floor(balance)}
      </span>
    </button>
  );
};

export default CreditsDisplay;
