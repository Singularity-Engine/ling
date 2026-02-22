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
        padding: '5px 10px',
        borderRadius: '16px',
        background: 'rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        font: 'inherit',
        color: 'inherit',
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
