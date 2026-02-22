/**
 * PricingOverlay - 定价页面浮层
 *
 * 展示订阅方案和积分包，通过 Stripe 完成支付。
 * 从 ui-context 的 pricingOpen 控制显示/隐藏。
 */

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { apiClient } from '@/services/api-client';
import { useUI } from '@/context/ui-context';
import { useAuth } from '@/context/auth-context';
import { toaster } from '@/components/ui/toaster';
import { createLogger } from '@/utils/logger';

const log = createLogger('Pricing');

/* ── Module-level style constants (allocated once, never GC'd) ── */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  overflow: 'auto',
};

const innerWrapperStyle: React.CSSProperties = {
  maxWidth: '1100px',
  width: '100%',
  position: 'relative',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-40px',
  right: '0',
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontSize: '28px',
  cursor: 'pointer',
  padding: '4px',
  lineHeight: 1,
};

const titleContainerStyle: React.CSSProperties = { textAlign: 'center', marginBottom: '32px' };
const titleStyle: React.CSSProperties = { color: '#fff', fontSize: '28px', fontWeight: 700, margin: 0 };
const subtitleStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginTop: '8px' };

const planGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: '16px',
  marginBottom: '32px',
};

const popularBadgeBase: React.CSSProperties = {
  position: 'absolute',
  top: '-12px',
  left: '50%',
  transform: 'translateX(-50%)',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 700,
  padding: '4px 16px',
  borderRadius: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const planInfoStyle: React.CSSProperties = { marginBottom: '16px' };
const planSubtitleStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '4px 0 0' };
const planPriceContainerStyle: React.CSSProperties = { marginBottom: '20px' };
const planPriceStyle: React.CSSProperties = { color: '#fff', fontSize: '32px', fontWeight: 700 };
const planPeriodStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.4)', fontSize: '14px' };

const featureListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '0 0 20px', flex: 1 };
const featureItemStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.7)',
  fontSize: '13px',
  padding: '4px 0',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
};

const freeBtnStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.3)',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'default',
};

const creditSectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '24px',
};

const creditTitleStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' };
const creditDescStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '-8px 0 16px' };
const creditFlexStyle: React.CSSProperties = { display: 'flex', gap: '12px', flexWrap: 'wrap' };
const creditAmountStyle: React.CSSProperties = { fontSize: '20px', fontWeight: 700 };
const creditPriceStyle: React.CSSProperties = { fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' };
const creditNoteStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '12px', textAlign: 'center' };
const manageLinkContainerStyle: React.CSSProperties = { textAlign: 'center', marginTop: '16px' };
const manageLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  fontSize: '13px',
  cursor: 'pointer',
  textDecoration: 'underline',
};

const PLANS = [
  {
    name: 'Spark',
    subtitle: 'Free',
    price: '$0',
    period: '',
    key: null,
    features: [
      '50 messages/day',
      '10 min voice/day',
      '10 web searches/day',
      '3 image generations/day',
      '7-day memory',
      'Sonnet AI model',
    ],
    color: '#6b7280',
    popular: false,
    isFree: true,
  },
  {
    name: 'Stardust',
    subtitle: 'Daily companion',
    price: '$14.99',
    period: '/mo',
    key: 'stardust_monthly',
    features: [
      '500 messages/day',
      '2h voice/day',
      'Unlimited web search',
      '30 image generations/day',
      '90-day memory',
      'Sonnet AI model',
      '100 credits/month',
    ],
    color: '#a855f7',
    popular: false,
    isFree: false,
  },
  {
    name: 'Resonance',
    subtitle: 'Deep connection',
    price: '$39.99',
    period: '/mo',
    key: 'resonance_monthly',
    features: [
      'Unlimited messages',
      'Unlimited voice',
      'Unlimited tools',
      'Permanent memory',
      'Opus AI model',
      'Desktop pet mode',
      '500 credits/month',
    ],
    color: '#7c3aed',
    popular: true,
    isFree: false,
  },
  {
    name: 'Eternal',
    subtitle: 'Best value',
    price: '$299.99',
    period: '/yr',
    key: 'eternal_yearly',
    features: [
      'Everything in Resonance',
      'Full API access',
      'Custom characters',
      'Priority support',
      'Save $179.89 vs monthly',
    ],
    color: '#4f46e5',
    popular: false,
    isFree: false,
  },
];

const CREDIT_PACKS = [
  { credits: 100, price: '$4.99' },
  { credits: 500, price: '$19.99' },
  { credits: 2000, price: '$69.99' },
];

/* ── Pre-computed per-plan styles (PLANS is static, computed once at module load) ── */

const planCardStyles = PLANS.map((plan) => ({
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: plan.popular
      ? `2px solid ${plan.color}`
      : '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
  } as React.CSSProperties,
  badge: { ...popularBadgeBase, background: plan.color } as React.CSSProperties,
  name: { color: plan.color, fontSize: '18px', fontWeight: 700, margin: 0 } as React.CSSProperties,
  bullet: { color: plan.color, fontSize: '10px', marginTop: '4px' } as React.CSSProperties,
}));

const planBtnBase: React.CSSProperties = {
  padding: '10px',
  borderRadius: '10px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 600,
  transition: 'background 0.2s, opacity 0.2s',
};

const creditBtnBase: React.CSSProperties = {
  flex: '1 1 140px',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid rgba(139, 92, 246, 0.2)',
  background: 'rgba(139, 92, 246, 0.08)',
  color: '#fff',
  textAlign: 'center',
  transition: 'background 0.2s, border-color 0.2s',
};

const PricingOverlay: React.FC = memo(() => {
  const { pricingOpen, setPricingOpen } = useUI();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    if (!pricingOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPricingOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pricingOpen, setPricingOpen]);

  if (!pricingOpen) return null;

  const handleCheckout = async (
    type: 'subscription' | 'credits',
    plan?: string,
    credits?: number,
  ) => {
    const key = plan || `credits-${credits}`;
    setLoading(key);
    try {
      const data = await apiClient.post<{ checkout_url?: string; detail?: string }>(
        '/api/stripe/create-checkout',
        { type, plan, credits },
      );
      if (data.checkout_url) {
        window.open(data.checkout_url, '_blank');
      } else {
        toaster.create({
          title: data.detail || 'Failed to create checkout session',
          type: 'error',
          duration: 4000,
        });
      }
    } catch (err: unknown) {
      log.error('Checkout error:', err);
      toaster.create({
        title: err instanceof Error ? err.message : 'Network error',
        type: 'error',
        duration: 4000,
      });
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    try {
      const data = await apiClient.get<{ portal_url?: string }>('/api/stripe/portal');
      if (data.portal_url) {
        window.open(data.portal_url, '_blank');
      }
    } catch (err: unknown) {
      log.error('Portal error:', err);
      toaster.create({
        title: err instanceof Error ? err.message : 'Network error',
        type: 'error',
        duration: 4000,
      });
    }
  };

  const currentPlan = user?.plan || 'free';

  const handleClose = useCallback(() => setPricingOpen(false), [setPricingOpen]);
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) setPricingOpen(false); },
    [setPricingOpen],
  );

  // Dynamic button styles that depend on runtime state
  const getPlanBtnStyle = useCallback(
    (plan: typeof PLANS[number], isCurrent: boolean): React.CSSProperties => ({
      ...planBtnBase,
      background: isCurrent
        ? 'rgba(255,255,255,0.08)'
        : plan.popular ? plan.color : `${plan.color}33`,
      color: isCurrent ? 'rgba(255,255,255,0.4)' : '#fff',
      cursor: isCurrent ? 'default' : loading ? 'wait' : 'pointer',
    }),
    [loading],
  );

  const creditBtnDynamic = useMemo((): React.CSSProperties => ({
    ...creditBtnBase,
    cursor: currentPlan === 'free' ? 'not-allowed' : loading ? 'wait' : 'pointer',
    opacity: currentPlan === 'free' ? 0.4 : 1,
  }), [currentPlan, loading]);

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={innerWrapperStyle}>
        {/* Close button */}
        <button onClick={handleClose} style={closeBtnStyle}>
          ×
        </button>

        {/* Title */}
        <div style={titleContainerStyle}>
          <h2 style={titleStyle}>Choose Your Plan</h2>
          <p style={subtitleStyle}>
            Unlock deeper conversations, more tools, and permanent memory
          </p>
        </div>

        {/* Plan cards */}
        <div style={planGridStyle}>
          {PLANS.map((plan, idx) => {
            const styles = planCardStyles[idx];
            const isCurrent = (plan.isFree && currentPlan === 'free') ||
              plan.key?.startsWith(currentPlan);
            return (
              <div key={plan.name} style={styles.card}>
                {plan.popular && (
                  <div style={styles.badge}>Most Popular</div>
                )}

                <div style={planInfoStyle}>
                  <h3 style={styles.name}>{plan.name}</h3>
                  <p style={planSubtitleStyle}>{plan.subtitle}</p>
                </div>

                <div style={planPriceContainerStyle}>
                  <span style={planPriceStyle}>{plan.price}</span>
                  {plan.period && <span style={planPeriodStyle}>{plan.period}</span>}
                </div>

                <ul style={featureListStyle}>
                  {plan.features.map((f) => (
                    <li key={f} style={featureItemStyle}>
                      <span style={styles.bullet}>●</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.isFree ? (
                  <button disabled style={freeBtnStyle}>
                    {isCurrent ? 'Current Plan' : 'Free'}
                  </button>
                ) : (
                  <button
                    disabled={!!loading || isCurrent}
                    onClick={() =>
                      plan.key && handleCheckout('subscription', plan.key)
                    }
                    style={getPlanBtnStyle(plan, isCurrent)}
                  >
                    {isCurrent
                      ? 'Current Plan'
                      : loading === plan.key
                        ? 'Loading...'
                        : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Credit packs */}
        <div style={creditSectionStyle}>
          <h3 style={creditTitleStyle}>Credit Packs</h3>
          <p style={creditDescStyle}>
            For image generation, long writing, voice calls, and more
          </p>
          <div style={creditFlexStyle}>
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.credits}
                disabled={!!loading || currentPlan === 'free'}
                onClick={() => handleCheckout('credits', undefined, pack.credits)}
                style={creditBtnDynamic}
              >
                <div style={creditAmountStyle}>✦ {pack.credits}</div>
                <div style={creditPriceStyle}>
                  {loading === `credits-${pack.credits}` ? 'Loading...' : pack.price}
                </div>
              </button>
            ))}
          </div>
          {currentPlan === 'free' && (
            <p style={creditNoteStyle}>
              Subscribe to a paid plan to purchase credit packs
            </p>
          )}
        </div>

        {/* Manage subscription */}
        {currentPlan !== 'free' && (
          <div style={manageLinkContainerStyle}>
            <button onClick={handlePortal} style={manageLinkStyle}>
              Manage Subscription
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

PricingOverlay.displayName = 'PricingOverlay';

export default PricingOverlay;
