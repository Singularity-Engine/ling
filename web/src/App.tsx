import { useState, useEffect, useCallback, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type CSSProperties } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

import { lazyRetry } from "./utils/lazy-retry";

import { HreflangTags } from "./components/seo/HreflangTags";
import { StructuredData } from "./components/seo/StructuredData";
import { LOCALE_MAP, type SupportedLanguage, SUPPORTED_LANGUAGES } from "./i18n";
import { Toaster, toaster } from "./components/ui/toaster";
import { NetworkStatusBanner } from "./components/effects/NetworkStatusBanner";
import { Providers } from "./components/layout/Providers";
import { AuthProvider, useAuthState, useAuthActions } from "./context/AuthContext";
import { SpatialLayout } from "./components/dialogue/SpatialLayout";
import { OAuthModal } from "./components/auth/OAuthModal";
import { createLogger } from "./utils/logger";

import { captureError } from "./lib/sentry";
import "./index.css";

// ─── Lazy-loaded route pages ───
const AuthPage = lazyRetry(() => import("./pages/AuthPage").then(m => ({ default: m.AuthPage })));
const TermsPage = lazyRetry(() => import("./pages/TermsPage").then(m => ({ default: m.TermsPage })));
const DashboardPage = lazyRetry(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const OAuthCallbackPage = lazyRetry(() => import("./pages/OAuthCallbackPage").then(m => ({ default: m.OAuthCallbackPage })));

// Onboarding wizard disabled — Ling's greeting is the onboarding now.
// const shouldShowOnboarding = () => !sessionStorage.getItem(SS_ONBOARDING_DONE);

const rootLog = createLogger("App");

// ─── ErrorBoundary style constants (avoid per-render allocation on error screen) ───

const S_EB_WRAP: CSSProperties = {
  width: '100%', height: '100vh', background: 'var(--ling-bg-deep)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};
const S_EB_INNER: CSSProperties = { maxWidth: 'min(440px, calc(100% - var(--ling-space-8)))', textAlign: 'center', padding: 'var(--ling-space-8) var(--ling-space-4)' };
const S_EB_EMOJI: CSSProperties = { fontSize: 'var(--ling-font-hero)', marginBottom: 'var(--ling-space-4)', opacity: 0.8 };
const S_EB_TITLE: CSSProperties = { color: 'var(--ling-purple-lighter)', marginBottom: 'var(--ling-space-2)', fontSize: 'var(--ling-font-xl)', fontWeight: 600 };
const S_EB_DESC: CSSProperties = { color: 'var(--ling-text-dim)', fontSize: 'var(--ling-font-md)', marginBottom: 'var(--ling-space-6)', lineHeight: 1.6 };
const S_EB_BTN_ROW: CSSProperties = { display: 'flex', gap: 'var(--ling-space-3)', justifyContent: 'center', flexWrap: 'wrap' };
const _EB_BTN: CSSProperties = { padding: 'var(--ling-space-3) var(--ling-space-6)', borderRadius: 'var(--ling-radius-8)', fontSize: 'var(--ling-font-md)', cursor: 'pointer', border: 'none', transition: `opacity var(--ling-duration-fast)` };
const S_EB_BTN_PRIMARY: CSSProperties = { ..._EB_BTN, background: 'var(--ling-purple-50)', color: '#fff' };
const S_EB_BTN_SECONDARY: CSSProperties = { ..._EB_BTN, background: 'var(--ling-overlay-8)', color: 'var(--ling-text-soft)', border: '1px solid var(--ling-overlay-12)' };
const S_EB_DETAIL_TOGGLE: CSSProperties = { marginTop: 'var(--ling-space-5)', background: 'none', border: 'none', color: 'var(--ling-text-muted)', fontSize: 'var(--ling-font-sm)', cursor: 'pointer' };
const S_EB_DETAIL_PRE: CSSProperties = {
  marginTop: 'var(--ling-space-3)', textAlign: 'left', color: 'rgba(255,107,107,0.7)',
  fontSize: 'var(--ling-font-xs)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  maxHeight: 200, overflow: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: 'var(--ling-space-3)', borderRadius: 'var(--ling-radius-8)',
};

// Error Boundary
interface ErrorBoundaryState { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; showDetail: boolean; }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, error: null, errorInfo: null, showDetail: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { this.setState({ errorInfo }); rootLog.error('Root crash:', error, errorInfo.componentStack); captureError(error, { boundary: 'root', componentStack: errorInfo.componentStack ?? '' }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={S_EB_WRAP}>
          <div style={S_EB_INNER}>
            <div style={S_EB_EMOJI} aria-hidden="true">:(</div>
            <h2 style={S_EB_TITLE}>{i18next.t('error.pageCrashTitle')}</h2>
            <p style={S_EB_DESC}>
              {i18next.t('error.pageCrashLine1')}<br />{i18next.t('error.pageCrashLine2')}
            </p>
            <div style={S_EB_BTN_ROW}>
              <button onClick={() => window.location.reload()} style={S_EB_BTN_PRIMARY}>
                {i18next.t('error.refreshPage')}
              </button>
              <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={S_EB_BTN_SECONDARY}>
                {i18next.t('error.clearCacheRefresh')}
              </button>
            </div>
            <button
              onClick={() => this.setState({ showDetail: !this.state.showDetail })}
              style={S_EB_DETAIL_TOGGLE}
            >
              {this.state.showDetail ? i18next.t('error.hideDetails') : i18next.t('error.showErrorDetails')}
            </button>
            {this.state.showDetail && (
              <pre style={S_EB_DETAIL_PRE}>
                {this.state.error?.toString()}{'\n'}{this.state.errorInfo?.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Auth overlay inline styles
const S_AUTH_OVERLAY: CSSProperties = {
  position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)',
  zIndex: 'var(--ling-z-modal, 1000)' as unknown as number,
};
const S_AUTH_CTA: CSSProperties = {
  background: 'var(--ling-glass)', backdropFilter: 'var(--ling-glass-blur)',
  WebkitBackdropFilter: 'var(--ling-glass-blur)',
  border: '1px solid var(--ling-glass-border)', borderRadius: 'var(--ling-radius-full, 9999px)',
  padding: 'var(--ling-space-3) var(--ling-space-6)',
  color: 'var(--ling-text-1)', fontFamily: 'var(--ling-font-world)',
  fontSize: 15, cursor: 'pointer', transition: 'background 200ms, border-color 200ms',
};

/**
 * 隐藏 index.html 中的 #loading-fallback。
 * 放在 AuthProvider 内部，当 auth 初始化完成后平滑淡出 fallback。
 */
function DismissFallback() {
  const { isLoading } = useAuthState();
  useEffect(() => {
    if (!isLoading) {
      const el = document.getElementById('loading-fallback');
      if (!el) return;
      el.style.opacity = '0';
      const id = setTimeout(() => el.remove(), 400);
      return () => clearTimeout(id);
    }
  }, [isLoading]);
  return null;
}

/** 已登录时阻止访问 login/register */
function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthState();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** 处理 Stripe checkout 回调 */
function useCheckoutCallback() {
  const { refreshUser } = useAuthActions();
  const { t } = useTranslation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      toaster.create({ title: t('billing.checkoutSuccess'), type: 'success', duration: 5000 });
      refreshUser();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkout === 'canceled') {
      toaster.create({ title: t('billing.checkoutCanceled'), type: 'info', duration: 3000 });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshUser, t]);
}

/** 主应用 — Conversation as Space */
function MainApp() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading } = useAuthState();
  const [showAuth, setShowAuth] = useState(false);
  const currentLocale = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? LOCALE_MAP[i18n.language as SupportedLanguage]
    : "en_US";
  useCheckoutCallback();

  return (
    <>
      <Helmet>
        <title>{t("seo.homeTitle")}</title>
        <meta name="description" content={t("seo.homeDesc")} />
        <meta property="og:title" content={t("seo.homeOgTitle")} />
        <meta property="og:description" content={t("seo.homeDesc")} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <meta property="og:locale" content={currentLocale} />
        {Object.values(LOCALE_MAP)
          .filter((l) => l !== currentLocale)
          .map((l) => (
            <meta key={l} property="og:locale:alternate" content={l} />
          ))}
        <link rel="canonical" href="https://ling.sngxai.com/" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/" />
      <StructuredData />
      <Providers>
        <SpatialLayout />
        {!isAuthenticated && !isLoading && (
          <div style={S_AUTH_OVERLAY}>
            <button
              style={S_AUTH_CTA}
              onClick={() => setShowAuth(true)}
              data-voice="world"
            >
              Sign in to talk to Ling →
            </button>
          </div>
        )}
        <OAuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </Providers>

      <NetworkStatusBanner />
      <Toaster />
    </>
  );
}

// CSS-only page transition: lightweight fade-in on route change.
// Replaces framer-motion AnimatePresence to defer the ~30KB library
// from the critical path (now only loaded by lazy Constellation chunk).
const S_PAGE_WRAP: CSSProperties = { minHeight: "100dvh", animation: "pageFadeIn var(--ling-duration-fast) var(--ling-ease-default)" };

function AnimatedRoutes(): JSX.Element {
  const location = useLocation();
  // Normalize key so all catch-all paths share the same key (avoids spurious remount)
  const pageKey = ['/auth', '/login', '/register', '/terms', '/dashboard', '/oauth/callback'].includes(location.pathname)
    ? location.pathname
    : '/';

  // Scroll to top on route change — prevents inheriting scroll position from previous page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div key={pageKey} style={S_PAGE_WRAP}>
      <Suspense fallback={null}>
        <Routes location={location}>
          <Route path="/auth" element={<GuestOnly><AuthPage /></GuestOnly>} />
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/register" element={<Navigate to="/auth" replace />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/*" element={<MainApp />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DismissFallback />
          <AnimatedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
