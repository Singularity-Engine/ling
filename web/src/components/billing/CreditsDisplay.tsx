/**
 * CreditsDisplay - 积分余额显示组件
 *
 * 显示在界面右上角，展示当前用户的积分余额。
 * owner/admin 和 free 用户不显示。
 */

import { memo, useCallback, type CSSProperties } from 'react';
import { useAuthState } from '@/context/AuthContext';
import { useUIActions } from '@/context/UiContext';

// ── Constants ──
const LOW_BALANCE_THRESHOLD = 10;

// ── Pre-allocated style constants ──
const S_BUTTON: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 10px',
  borderRadius: '16px',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  cursor: 'pointer',
  transition: 'background 0.3s ease, border-color 0.3s ease, transform 0.15s ease',
  font: 'inherit',
  color: 'inherit',
  background: 'var(--ling-surface-elevated)',
  border: '1px solid var(--ling-surface-border)',
};
const S_ICON_NORMAL: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-purple-85)' };
const S_ICON_LOW: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-error)' };
const S_TEXT_NORMAL: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-text-secondary)' };
const S_TEXT_LOW: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-error)' };

const CreditsDisplay: React.FC = memo(() => {
  const { user } = useAuthState();
  const { setPricingOpen } = useUIActions();
  const openPricing = useCallback(() => setPricingOpen(true), [setPricingOpen]);

  if (!user) return null;

  // owner/admin 不显示积分
  if (user.role === 'owner' || user.role === 'admin') return null;

  // free 用户不显示积分（不扣积分）
  if (!user.plan || user.plan === 'free') return null;

  const balance = user.credits_balance ?? 0;
  const isLow = balance <= LOW_BALANCE_THRESHOLD;

  return (
    <button
      onClick={openPricing}
      className="ling-credits-display"
      style={S_BUTTON}
      aria-label={`Credits: ${Math.floor(balance)}. Click to view pricing.`}
      title={`Credits: ${balance}`}
    >
      <span aria-hidden="true" style={isLow ? S_ICON_LOW : S_ICON_NORMAL}>✦</span>
      <span style={isLow ? S_TEXT_LOW : S_TEXT_NORMAL}>{Math.floor(balance)}</span>
    </button>
  );
});

CreditsDisplay.displayName = 'CreditsDisplay';

export default CreditsDisplay;
