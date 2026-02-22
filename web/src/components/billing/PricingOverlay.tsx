/**
 * PricingOverlay - 定价页面浮层
 *
 * 展示订阅方案和积分包，通过 Stripe 完成支付。
 * 从 ui-context 的 pricingOpen 控制显示/隐藏。
 */

import { useState, useEffect } from 'react';
import { apiClient } from '@/services/api-client';
import { useUI } from '@/context/ui-context';
import { useAuth } from '@/context/auth-context';

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

const PricingOverlay: React.FC = () => {
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
        alert(data.detail || 'Failed to create checkout session');
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      alert(err instanceof Error ? err.message : 'Network error');
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
      console.error('Portal error:', err);
      alert(err instanceof Error ? err.message : 'Network error');
    }
  };

  const currentPlan = user?.plan || 'free';

  return (
    <div
      style={{
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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setPricingOpen(false);
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setPricingOpen(false)}
          style={{
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
          }}
        >
          ×
        </button>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: 700, margin: 0 }}>
            Choose Your Plan
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginTop: '8px' }}>
            Unlock deeper conversations, more tools, and permanent memory
          </p>
        </div>

        {/* Plan cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {PLANS.map((plan) => {
            const isCurrent = (plan.isFree && currentPlan === 'free') ||
              plan.key?.startsWith(currentPlan);
            return (
              <div
                key={plan.name}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: plan.popular
                    ? `2px solid ${plan.color}`
                    : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {plan.popular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: plan.color,
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 16px',
                      borderRadius: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Most Popular
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ color: plan.color, fontSize: '18px', fontWeight: 700, margin: 0 }}>
                    {plan.name}
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '4px 0 0' }}>
                    {plan.subtitle}
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <span style={{ color: '#fff', fontSize: '32px', fontWeight: 700 }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                      {plan.period}
                    </span>
                  )}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', flex: 1 }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: '13px',
                        padding: '4px 0',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                      }}
                    >
                      <span style={{ color: plan.color, fontSize: '10px', marginTop: '4px' }}>●</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.isFree ? (
                  <button
                    disabled
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'default',
                    }}
                  >
                    {isCurrent ? 'Current Plan' : 'Free'}
                  </button>
                ) : (
                  <button
                    disabled={!!loading || isCurrent}
                    onClick={() =>
                      plan.key && handleCheckout('subscription', plan.key)
                    }
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isCurrent
                        ? 'rgba(255,255,255,0.08)'
                        : plan.popular
                          ? plan.color
                          : `${plan.color}33`,
                      color: isCurrent
                        ? 'rgba(255,255,255,0.4)'
                        : '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: isCurrent ? 'default' : loading ? 'wait' : 'pointer',
                      transition: 'background 0.2s, opacity 0.2s',
                    }}
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
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>
            Credit Packs
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '-8px 0 16px' }}>
            For image generation, long writing, voice calls, and more
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.credits}
                disabled={!!loading || currentPlan === 'free'}
                onClick={() => handleCheckout('credits', undefined, pack.credits)}
                style={{
                  flex: '1 1 140px',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  background: 'rgba(139, 92, 246, 0.08)',
                  color: '#fff',
                  cursor: currentPlan === 'free' ? 'not-allowed' : loading ? 'wait' : 'pointer',
                  textAlign: 'center',
                  transition: 'background 0.2s, border-color 0.2s',
                  opacity: currentPlan === 'free' ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: '20px', fontWeight: 700 }}>✦ {pack.credits}</div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                  {loading === `credits-${pack.credits}` ? 'Loading...' : pack.price}
                </div>
              </button>
            ))}
          </div>
          {currentPlan === 'free' && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
              Subscribe to a paid plan to purchase credit packs
            </p>
          )}
        </div>

        {/* Manage subscription */}
        {currentPlan !== 'free' && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              onClick={handlePortal}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Manage Subscription
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingOverlay;
