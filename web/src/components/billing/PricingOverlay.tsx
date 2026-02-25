/**
 * PricingOverlay - 定价页面浮层
 *
 * 展示订阅方案和积分包，通过 Stripe 完成支付。
 * 从 ui-context 的 pricingOpen 控制显示/隐藏。
 */

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api-client';
import { useUIState, useUIActions } from '@/context/UiContext';
import { useAuthState } from '@/context/AuthContext';
import { toaster } from '@/components/ui/toaster';
import { createLogger } from '@/utils/logger';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const EXIT_MS = 200; // matches overlayFadeOut / overlaySlideOut duration

const log = createLogger('Pricing');

/* ── Module-level style constants (allocated once, never GC'd) ── */

const S_OVERLAY_BASE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'var(--ling-overlay-heavy)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--ling-space-5)',
  overflow: 'auto',
};
const S_OVERLAY_OPEN: React.CSSProperties = { ...S_OVERLAY_BASE, animation: `overlayFadeIn var(--ling-duration-fast) var(--ling-ease-exit)` };
const S_OVERLAY_CLOSING: React.CSSProperties = { ...S_OVERLAY_BASE, animation: `overlayFadeOut ${EXIT_MS}ms var(--ling-ease-exit) forwards` };

const S_INNER_BASE: React.CSSProperties = {
  maxWidth: '1100px',
  width: '100%',
  position: 'relative',
};
const S_INNER_OPEN: React.CSSProperties = { ...S_INNER_BASE, animation: `overlaySlideIn var(--ling-duration-normal) var(--ling-ease-exit)` };
const S_INNER_CLOSING: React.CSSProperties = { ...S_INNER_BASE, animation: `overlaySlideOut ${EXIT_MS}ms var(--ling-ease-exit) forwards` };

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-40px',
  right: '0',
  background: 'none',
  border: 'none',
  color: 'var(--ling-text-dim)',
  fontSize: 'var(--ling-font-3xl)',
  cursor: 'pointer',
  padding: 'var(--ling-space-1)',
  lineHeight: 1,
  transition: `color var(--ling-duration-fast), transform var(--ling-duration-fast)`,
};

const titleContainerStyle: React.CSSProperties = { textAlign: 'center', marginBottom: 'var(--ling-space-8)' };
const titleStyle: React.CSSProperties = { color: 'var(--ling-text-primary)', fontSize: 'var(--ling-font-3xl)', fontWeight: 700, margin: 0 };
const subtitleStyle: React.CSSProperties = { color: 'var(--ling-text-dim)', fontSize: 'var(--ling-font-md)', marginTop: 'var(--ling-space-2)' };

const planGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 'var(--ling-space-4)',
  marginBottom: 'var(--ling-space-8)',
};

const popularBadgeBase: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(-1 * var(--ling-space-3))',
  left: '50%',
  transform: 'translateX(-50%)',
  color: 'var(--ling-text-primary)',
  fontSize: 'var(--ling-font-xs)',
  fontWeight: 700,
  padding: 'var(--ling-space-1) var(--ling-space-4)',
  borderRadius: 'var(--ling-radius-md)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const planInfoStyle: React.CSSProperties = { marginBottom: 'var(--ling-space-4)' };
const planSubtitleStyle: React.CSSProperties = { color: 'var(--ling-text-tertiary)', fontSize: 'var(--ling-font-sm)', margin: 'var(--ling-space-1) 0 0' };
const planPriceContainerStyle: React.CSSProperties = { marginBottom: 'var(--ling-space-5)' };
const planPriceStyle: React.CSSProperties = { color: 'var(--ling-text-primary)', fontSize: 'var(--ling-font-price)', fontWeight: 700 };
const planPeriodStyle: React.CSSProperties = { color: 'var(--ling-text-tertiary)', fontSize: 'var(--ling-font-md)' };

const featureListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '0 0 var(--ling-space-5)', flex: 1 };
const featureItemStyle: React.CSSProperties = {
  color: 'var(--ling-text-soft)',
  fontSize: 'var(--ling-font-13)',
  padding: 'var(--ling-space-1) 0',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--ling-space-2)',
};

const freeBtnStyle: React.CSSProperties = {
  padding: 'var(--ling-space-3)',
  borderRadius: 'var(--ling-radius-md)',
  border: '1px solid var(--ling-surface-hover)',
  background: 'transparent',
  color: 'var(--ling-text-muted)',
  fontSize: 'var(--ling-font-md)',
  fontWeight: 600,
  cursor: 'default',
};

const creditSectionStyle: React.CSSProperties = {
  background: 'var(--ling-surface-subtle)',
  border: '1px solid var(--ling-surface-border)',
  borderRadius: 'var(--ling-radius-lg)',
  padding: 'var(--ling-space-6)',
};

const creditTitleStyle: React.CSSProperties = { color: 'var(--ling-text-secondary)', fontSize: 'var(--ling-font-lg)', fontWeight: 600, margin: '0 0 var(--ling-space-4)' };
const creditDescStyle: React.CSSProperties = { color: 'var(--ling-text-tertiary)', fontSize: 'var(--ling-font-sm)', margin: 'calc(-1 * var(--ling-space-2)) 0 var(--ling-space-4)' };
const creditFlexStyle: React.CSSProperties = { display: 'flex', gap: 'var(--ling-space-3)', flexWrap: 'wrap' };
const creditAmountStyle: React.CSSProperties = { fontSize: 'var(--ling-font-xl)', fontWeight: 700 };
const creditPriceStyle: React.CSSProperties = { fontSize: 'var(--ling-font-md)', color: 'var(--ling-btn-ghost-color)', marginTop: 'var(--ling-space-1)' };
const creditNoteStyle: React.CSSProperties = { color: 'var(--ling-text-muted)', fontSize: 'var(--ling-font-sm)', marginTop: 'var(--ling-space-3)', textAlign: 'center' };
const manageLinkContainerStyle: React.CSSProperties = { textAlign: 'center', marginTop: 'var(--ling-space-4)' };
const manageLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--ling-text-tertiary)',
  fontSize: 'var(--ling-font-13)',
  cursor: 'pointer',
  textDecoration: 'underline',
  transition: `color var(--ling-duration-fast), transform var(--ling-duration-fast)`,
};

const PLANS = [
  {
    i18nKey: 'spark',
    price: '$0',
    period: '',
    key: null,
    color: '#6b7280',
    popular: false,
    isFree: true,
  },
  {
    i18nKey: 'stardust',
    price: '$14.99',
    period: '/mo',
    key: 'stardust_monthly',
    color: '#a855f7',
    popular: false,
    isFree: false,
  },
  {
    i18nKey: 'resonance',
    price: '$39.99',
    period: '/mo',
    key: 'resonance_monthly',
    color: '#7c3aed',
    popular: true,
    isFree: false,
  },
  {
    i18nKey: 'eternal',
    price: '$299.99',
    period: '/yr',
    key: 'eternal_yearly',
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
    background: 'var(--ling-surface-subtle)',
    border: plan.popular
      ? `2px solid ${plan.color}`
      : '1px solid var(--ling-surface-hover)',
    borderRadius: 'var(--ling-radius-lg)',
    padding: 'var(--ling-space-6)',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
  } as React.CSSProperties,
  badge: { ...popularBadgeBase, background: plan.color } as React.CSSProperties,
  name: { color: plan.color, fontSize: 'var(--ling-font-lg)', fontWeight: 700, margin: 0 } as React.CSSProperties,
  bullet: { color: plan.color, fontSize: '10px', marginTop: 'var(--ling-space-1)' } as React.CSSProperties,
}));

const planBtnBase: React.CSSProperties = {
  padding: 'var(--ling-space-3)',
  borderRadius: 'var(--ling-radius-md)',
  border: 'none',
  fontSize: 'var(--ling-font-md)',
  fontWeight: 600,
  transition: `background var(--ling-duration-fast), opacity var(--ling-duration-fast)`,
};

const creditBtnBase: React.CSSProperties = {
  flex: '1 1 140px',
  padding: 'var(--ling-space-4)',
  borderRadius: 'var(--ling-radius-md)',
  border: '1px solid var(--ling-purple-20)',
  background: 'var(--ling-purple-08)',
  color: 'var(--ling-text-primary)',
  textAlign: 'center',
  transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast)`,
};

// Lazy-cached plan button styles — avoids per-render allocation in .map()
// Key: "planIdx:isCurrent:hasLoading" → at most 4×2×2 = 16 entries
const _planBtnCache = new Map<string, React.CSSProperties>();
function getPlanBtnStyleCached(
  plan: typeof PLANS[number],
  idx: number,
  isCurrent: boolean,
  hasLoading: boolean,
): React.CSSProperties {
  const key = `${idx}:${isCurrent}:${hasLoading}`;
  let s = _planBtnCache.get(key);
  if (!s) {
    s = {
      ...planBtnBase,
      background: isCurrent
        ? 'var(--ling-surface-border)'
        : plan.popular ? plan.color : `${plan.color}33`,
      color: isCurrent ? 'var(--ling-text-tertiary)' : 'var(--ling-text-primary)',
      cursor: isCurrent ? 'default' : hasLoading ? 'wait' : 'pointer',
    };
    _planBtnCache.set(key, s);
  }
  return s;
}

const PricingOverlay: React.FC = memo(() => {
  const { t } = useTranslation();
  const { pricingOpen } = useUIState();
  const { setPricingOpen } = useUIActions();
  const { user } = useAuthState();
  const [loading, setLoading] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus-trap: keep Tab/Shift+Tab within the dialog
  useFocusTrap(dialogRef, pricingOpen && !closing);

  // Move focus into the dialog when it opens
  useEffect(() => {
    if (pricingOpen) requestAnimationFrame(() => dialogRef.current?.focus());
  }, [pricingOpen]);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  const currentPlan = user?.plan || 'free';

  // Ref mirror — lets handleClose read the latest `closing` without depending
  // on it, keeping the callback stable across closing-state transitions and
  // avoiding cascading re-creation of handleOverlayClick.
  const closingRef = useRef(closing);
  closingRef.current = closing;

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      setPricingOpen(false);
    }, EXIT_MS);
  }, [setPricingOpen]);

  // ESC to close — handleClose is stable (closingRef pattern), safe to use directly
  useEffect(() => {
    if (!pricingOpen) return;
    setClosing(false);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pricingOpen, handleClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) handleClose(); },
    [handleClose],
  );

  const handleCheckout = useCallback(async (
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
  }, []);

  const handlePortal = useCallback(async () => {
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
  }, []);

  // Pre-computed credit button styles (4 combos: free/paid × loading/idle)
  const creditBtnDynamic = useMemo((): React.CSSProperties => ({
    ...creditBtnBase,
    cursor: currentPlan === 'free' ? 'not-allowed' : loading ? 'wait' : 'pointer',
    opacity: currentPlan === 'free' ? 0.4 : 1,
  }), [currentPlan, loading]);

  if (!pricingOpen && !closing) return null;

  return (
    <div style={closing ? S_OVERLAY_CLOSING : S_OVERLAY_OPEN} onClick={handleOverlayClick}>
      <div ref={dialogRef} tabIndex={-1} style={closing ? S_INNER_CLOSING : S_INNER_OPEN} role="dialog" aria-modal="true" aria-labelledby="pricing-title">
        {/* Close button */}
        <button className="ling-pricing-close" onClick={handleClose} style={closeBtnStyle} aria-label={t("pricing.closeLabel")}>
          ×
        </button>

        {/* Title */}
        <div style={titleContainerStyle}>
          <h2 id="pricing-title" style={titleStyle}>{t("pricing.title")}</h2>
          <p style={subtitleStyle}>
            {t("pricing.subtitle")}
          </p>
        </div>

        {/* Plan cards */}
        <div style={planGridStyle}>
          {PLANS.map((plan, idx) => {
            const styles = planCardStyles[idx];
            const isCurrent = (plan.isFree && currentPlan === 'free') ||
              plan.key?.startsWith(currentPlan);
            const name = t(`pricing.${plan.i18nKey}Name`);
            const subtitle = t(`pricing.${plan.i18nKey}Subtitle`);
            const features = t(`pricing.${plan.i18nKey}Features`, { returnObjects: true }) as string[];
            return (
              <div key={plan.i18nKey} style={styles.card}>
                {plan.popular && (
                  <div style={styles.badge}>{t("pricing.popularBadge")}</div>
                )}

                <div style={planInfoStyle}>
                  <h3 style={styles.name}>{name}</h3>
                  <p style={planSubtitleStyle}>{subtitle}</p>
                </div>

                <div style={planPriceContainerStyle}>
                  <span style={planPriceStyle}>{plan.price}</span>
                  {plan.period && <span style={planPeriodStyle}>{plan.period}</span>}
                </div>

                <ul style={featureListStyle}>
                  {features.map((f) => (
                    <li key={f} style={featureItemStyle}>
                      <span style={styles.bullet}>●</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.isFree ? (
                  <button disabled style={freeBtnStyle} aria-label={t("pricing.planAriaFree", { name })}>
                    {isCurrent ? t("pricing.currentPlan") : t("pricing.free")}
                  </button>
                ) : (
                  <button
                    className={isCurrent ? undefined : 'ling-plan-btn'}
                    disabled={!!loading || isCurrent}
                    onClick={() =>
                      plan.key && handleCheckout('subscription', plan.key)
                    }
                    style={getPlanBtnStyleCached(plan, idx, isCurrent, !!loading)}
                    aria-label={isCurrent ? t("pricing.planAriaCurrent", { name }) : t("pricing.planAriaUpgrade", { name, price: plan.price, period: plan.period })}
                    aria-busy={loading === plan.key}
                  >
                    {isCurrent
                      ? t("pricing.currentPlan")
                      : loading === plan.key
                        ? t("pricing.loading")
                        : t("pricing.upgradeTo", { name })}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Credit packs */}
        <div style={creditSectionStyle}>
          <h3 style={creditTitleStyle}>{t("pricing.creditTitle")}</h3>
          <p style={creditDescStyle}>
            {t("pricing.creditDesc")}
          </p>
          <div style={creditFlexStyle}>
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.credits}
                className={currentPlan === 'free' ? undefined : 'ling-credit-btn'}
                disabled={!!loading || currentPlan === 'free'}
                onClick={() => handleCheckout('credits', undefined, pack.credits)}
                style={creditBtnDynamic}
                aria-label={t("pricing.creditAriaLabel", { count: pack.credits, price: pack.price })}
                aria-busy={loading === `credits-${pack.credits}`}
              >
                <div style={creditAmountStyle}>✦ {pack.credits}</div>
                <div style={creditPriceStyle}>
                  {loading === `credits-${pack.credits}` ? t("pricing.loading") : pack.price}
                </div>
              </button>
            ))}
          </div>
          {currentPlan === 'free' && (
            <p style={creditNoteStyle}>
              {t("pricing.creditGated")}
            </p>
          )}
        </div>

        {/* Manage subscription */}
        {currentPlan !== 'free' && (
          <div style={manageLinkContainerStyle}>
            <button className="ling-pricing-manage" onClick={handlePortal} style={manageLinkStyle} aria-label={t("pricing.manageLabel")}>
              {t("pricing.manageSubscription")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

PricingOverlay.displayName = 'PricingOverlay';

export default PricingOverlay;
