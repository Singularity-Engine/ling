/**
 * CreditsDisplay - 积分余额显示组件
 *
 * 显示在界面右上角，展示当前用户的积分余额。
 * owner/admin 和 free 用户不显示。
 */

import { memo, useState, useCallback, type CSSProperties } from 'react';
import { useAuthState } from '@/context/auth-context';
import { useUIActions } from '@/context/ui-context';

// ── Pre-allocated style constants ──
const S_BUTTON_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 10px',
  borderRadius: '16px',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  cursor: 'pointer',
  transition: 'background 0.3s ease, border-color 0.3s ease',
  font: 'inherit',
  color: 'inherit',
};
const S_BUTTON: CSSProperties = { ...S_BUTTON_BASE, background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.08)' };
const S_BUTTON_HOVER: CSSProperties = { ...S_BUTTON_BASE, background: 'rgba(0, 0, 0, 0.45)', border: '1px solid rgba(168, 85, 247, 0.3)' };
const S_ICON_NORMAL: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'rgba(168, 85, 247, 0.9)' };
const S_ICON_LOW: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-error)' };
const S_TEXT_NORMAL: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' };
const S_TEXT_LOW: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ling-error)' };

const CreditsDisplay: React.FC = memo(() => {
  const { user } = useAuthState();
  const { setPricingOpen } = useUIActions();
  const [hovered, setHovered] = useState(false);
  const openPricing = useCallback(() => setPricingOpen(true), [setPricingOpen]);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

  if (!user) return null;

  // owner/admin 不显示积分
  if (user.role === 'owner' || user.role === 'admin') return null;

  // free 用户不显示积分（不扣积分）
  if (!user.plan || user.plan === 'free') return null;

  const balance = user.credits_balance ?? 0;
  const isLow = balance <= 10;

  return (
    <button onClick={openPricing} onMouseEnter={onEnter} onMouseLeave={onLeave} style={hovered ? S_BUTTON_HOVER : S_BUTTON} title={`Credits: ${balance}`}>
      <span style={isLow ? S_ICON_LOW : S_ICON_NORMAL}>✦</span>
      <span style={isLow ? S_TEXT_LOW : S_TEXT_NORMAL}>{Math.floor(balance)}</span>
    </button>
  );
});

CreditsDisplay.displayName = 'CreditsDisplay';

export default CreditsDisplay;
