import { useState, useEffect, useCallback, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode, type CSSProperties } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

import { lazyRetry } from "./utils/lazy-retry";

// Lazy-loaded: only shown on first visit (before sessionStorage 'ling-overture-seen' is set).
const LandingAnimation = lazyRetry(() => import("./components/landing/LandingAnimation").then(m => ({ default: m.LandingAnimation })));

// Lazy-loaded: Witness Mode for unauthenticated visitors (after overture completes).
const WitnessMode = lazyRetry(() => import("./components/witness/WitnessMode").then(m => ({ default: m.WitnessMode })));

import { useMessagesRef, useHistoryListState, useHistoryListActions } from "./context/ChatHistoryContext";
import { useVADState, useVADActions } from "./context/VadContext";
import { useInterrupt } from "./hooks/utils/use-interrupt";
import { HreflangTags } from "./components/seo/HreflangTags";
import { StructuredData } from "./components/seo/StructuredData";
import { LOCALE_MAP, type SupportedLanguage, SUPPORTED_LANGUAGES } from "./i18n";
import { Toaster, toaster } from "./components/ui/toaster";
import { useWebSocketActions } from "./context/WebsocketContext";
import { useKeyboardShortcuts, type ShortcutDef } from "./hooks/useKeyboardShortcuts";
import { NetworkStatusBanner } from "./components/effects/NetworkStatusBanner";
import { useAffinityIdleExpression } from "./hooks/useAffinityIdleExpression";
import { useFirstMinute } from "./hooks/useFirstMinute";
import { useIsMobile, useIsDesktop } from "./hooks/useIsMobile";
import { SplitLayout } from "./components/layout/SplitLayout";
import { OverlayLayout } from "./components/layout/OverlayLayout";
import { Providers } from "./components/layout/Providers";
import { AuthProvider, useAuthState, useAuthActions } from "./context/AuthContext";
import { SectionErrorBoundary } from "./components/error/SectionErrorBoundary";
import { createLogger } from "./utils/logger";
import { MISC_COLORS } from "./constants/colors";
import { SS_VISITED } from "./constants/storage-keys";
import { captureError } from "./lib/sentry";
import { focusTextarea } from "./utils/dom";
import "./index.css";

// ─── Lazy-loaded overlays & modals (chunk loads on first use) ───
const ShortcutsOverlay = lazyRetry(() => import("./components/shortcuts/ShortcutsOverlay").then(m => ({ default: m.ShortcutsOverlay })));
const AboutOverlay = lazyRetry(() => import("./components/about/AboutOverlay").then(m => ({ default: m.AboutOverlay })));
const MemoryPanel = lazyRetry(() => import("./components/memory/MemoryPanel").then(m => ({ default: m.MemoryPanel })));
const PricingOverlay = lazyRetry(() => import("./components/billing/PricingOverlay"));
const InsufficientCreditsModal = lazyRetry(() => import("./components/billing/InsufficientCreditsModal"));
// Onboarding wizard disabled — Ling's first chat message serves as onboarding.
// Component files kept for reference; lazy import removed to avoid loading the chunk.
// const PersonalizedOnboarding = lazyRetry(() => import("./components/onboarding/PersonalizedOnboarding").then(m => ({ default: m.PersonalizedOnboarding })));

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
  maxHeight: 200, overflow: 'auto', background: MISC_COLORS.ERROR_BG, padding: 'var(--ling-space-3)', borderRadius: 'var(--ling-radius-8)',
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
            <div style={S_EB_EMOJI}>:(</div>
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

// Mobile: menu exit animation duration (used by closeMenu timer)
const MENU_EXIT_MS = 250;

// Witness ↔ Console crossfade duration (ms per direction)
// Total transition: ~800ms (400ms out + 400ms in) with mode="wait"-like sequencing.
// Reduced-motion users get instant swap (0ms).
const CROSSFADE_MS = 400;

// Detect prefers-reduced-motion at module level (static, avoids per-render media query)
const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const crossfadeDuration = prefersReducedMotion ? 0 : CROSSFADE_MS;

/**
 * CSS-based crossfade hook — simulates AnimatePresence mode="wait" without
 * importing framer-motion on the critical path.
 *
 * When the target key changes:
 *   1. Fade out current view (opacity 1 → 0, crossfadeDuration ms)
 *   2. Swap content (render new key)
 *   3. Fade in new view (opacity 0 → 1, crossfadeDuration ms)
 *
 * Returns { renderKey, opacity } — renderKey lags behind `activeKey` during
 * the fade-out phase so the old component stays mounted until fully invisible.
 */
function useCrossfade(activeKey: string) {
  const [renderKey, setRenderKey] = useState(activeKey);
  const [opacity, setOpacity] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (activeKey === renderKey) return;

    // Phase 1: fade out current view
    setOpacity(0);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Phase 2: swap to new content (still invisible)
      setRenderKey(activeKey);
      // Phase 3: fade in — needs a frame for the DOM swap before opacity transition
      requestAnimationFrame(() => setOpacity(1));
    }, crossfadeDuration);

    return () => clearTimeout(timerRef.current);
  }, [activeKey, renderKey]);

  // Cleanup timer on unmount
  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  const style: CSSProperties = useMemo(() => ({
    opacity,
    transition: `opacity ${crossfadeDuration}ms var(--ling-ease-default)`,
    willChange: opacity < 1 ? 'opacity' : 'auto',
  }), [opacity]);

  return { renderKey, style };
}

// Landing → main content transition
const S_MAIN_VISIBLE: CSSProperties = {
  opacity: 1, transform: "scale(1)",
  transition: "opacity 0.7s var(--ling-ease-default), transform 0.7s var(--ling-ease-default)",
};
const S_MAIN_HIDDEN: CSSProperties = {
  opacity: 0, transform: "scale(0.97)",
  transition: "opacity 0.7s var(--ling-ease-default), transform 0.7s var(--ling-ease-default)",
};


function MainContent(): JSX.Element {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

  // First-minute experience orchestration
  const { phase: firstMinutePhase } = useFirstMinute();
  // For new visitors on overlay (mobile/tablet): start collapsed, auto-expand at "inviting" phase
  const [chatExpanded, setChatExpanded] = useState(() => {
    const visitCount = parseInt(sessionStorage.getItem("ling-visit-count") || "0", 10);
    return visitCount > 0; // returning visitors start expanded, new visitors start collapsed
  });
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (firstMinutePhase === "inviting" && !autoExpandedRef.current && !isDesktop) {
      autoExpandedRef.current = true;
      setChatExpanded(true);
    }
  }, [firstMinutePhase, isDesktop]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const menuTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  // Auth state for low-balance badge on mobile hamburger
  const { user } = useAuthState();
  const showCreditsBadge = isMobile && !!user && !!user.plan && user.plan !== 'free'
    && user.role !== 'owner' && user.role !== 'admin'
    && (user.credits_balance ?? 0) <= 10;

  // Contexts for keyboard shortcuts
  const { micOn } = useVADState();
  const { startMic, stopMic } = useVADActions();
  const { sendMessage } = useWebSocketActions();
  const { interrupt } = useInterrupt();
  // Non-reactive ref getter — reads current messages at call-time without
  // subscribing MainContent to every message update (avoids ~N re-renders
  // per conversation turn where N = number of messages added).
  const { getMessages } = useMessagesRef();
  const { currentHistoryUid } = useHistoryListState();
  const { updateHistoryList } = useHistoryListActions();

  // Ref mirrors so createNewChat and shortcuts stay stable across state changes.
  // Without this, every mic toggle or history switch recreates callbacks →
  // rebuilds the shortcuts useMemo array, wasting work on every state change.
  const historyUidRef = useRef(currentHistoryUid);
  historyUidRef.current = currentHistoryUid;
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;

  // Update --vh CSS variable on resize & fullscreen change (used for mobile viewport height).
  // isMobile detection is handled by the shared useIsMobile() hook.
  useEffect(() => {
    const updateVh = () => {
      document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    };
    updateVh();
    let rafId = 0;
    let fsTimerId: ReturnType<typeof setTimeout>;
    const throttled = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; updateVh(); });
    };
    // Fullscreen transitions may not fire resize — listen explicitly
    const onFullscreenChange = () => { fsTimerId = setTimeout(throttled, 100); };
    window.addEventListener("resize", throttled);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      clearTimeout(fsTimerId);
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", throttled);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => () => { clearTimeout(menuTimerRef.current); }, []);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.documentElement.style.position = "fixed";
    document.body.style.position = "fixed";
    document.documentElement.style.width = "100%";
    document.body.style.width = "100%";
  }, []);

  // Mobile virtual keyboard: use visualViewport API to detect keyboard height
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(Math.max(0, offset));
    };

    let rafId = 0;
    const throttledResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; onResize(); });
    };

    vv.addEventListener("resize", throttledResize);
    vv.addEventListener("scroll", throttledResize, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", throttledResize);
      vv.removeEventListener("scroll", throttledResize);
    };
  }, []);

  const toggleChat = useCallback(() => {
    setChatExpanded(prev => !prev);
  }, []);
  const collapseChat = useCallback(() => setChatExpanded(false), []);

  // Stable open/close handlers — prevents defeating memo on ShortcutsOverlay, AboutOverlay, MemoryPanel
  const openMemory = useCallback(() => setMemoryOpen(true), []);
  const openAbout = useCallback(() => setAboutOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeMemory = useCallback(() => setMemoryOpen(false), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => {
    if (menuClosing) return;
    setMenuClosing(true);
    menuTimerRef.current = setTimeout(() => {
      setMenuClosing(false);
      setMenuOpen(false);
      hamburgerRef.current?.focus();
    }, MENU_EXIT_MS);
  }, [menuClosing]);

  // Focus trap: keep Tab cycling inside mobile menu
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !menuPanelRef.current) return;
    const focusable = menuPanelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, []);
  const handleExpandKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleChat(); }
  }, [toggleChat]);

  const createNewChat = useCallback(() => {
    const msgs = getMessages();
    if (historyUidRef.current && msgs.length > 0) {
      updateHistoryList(historyUidRef.current, msgs[msgs.length - 1]);
    }
    interrupt();
    sendMessage({ type: "create-new-history" });
  }, [getMessages, updateHistoryList, interrupt, sendMessage]);

  // Refs for ephemeral UI state — lets the Escape shortcut read latest values
  // without adding them as useMemo deps (avoids rebuilding the entire shortcuts
  // array on every overlay toggle or chat expand/collapse).
  const shortcutsOpenRef = useRef(shortcutsOpen);
  shortcutsOpenRef.current = shortcutsOpen;
  const aboutOpenRef = useRef(aboutOpen);
  aboutOpenRef.current = aboutOpen;
  const memoryOpenRef = useRef(memoryOpen);
  memoryOpenRef.current = memoryOpen;
  const chatExpandedRef = useRef(chatExpanded);
  chatExpandedRef.current = chatExpanded;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;

  // Keyboard shortcuts definition
  const shortcuts: ShortcutDef[] = useMemo(() => [
    {
      key: "mod+m",
      labelKey: "shortcuts.toggleMic",
      // Read via ref so mic state changes don't rebuild the entire shortcuts array.
      action: () => { micOnRef.current ? stopMic() : startMic(); },
    },
    {
      key: "/",
      labelKey: "shortcuts.focusInput",
      action: () => { focusTextarea(); },
    },
    {
      key: "mod+j",
      labelKey: "shortcuts.toggleChat",
      action: () => setChatExpanded(prev => !prev),
      allowInInput: true,
    },
    {
      key: "mod+k",
      labelKey: "shortcuts.newChat",
      action: createNewChat,
      allowInInput: true,
    },
    {
      key: "shift+i",
      labelKey: "shortcuts.showAbout",
      action: () => setAboutOpen(prev => !prev),
      // No allowInInput — conflicts with typing uppercase "I"
    },
    {
      key: "shift+?",
      labelKey: "shortcuts.showHelp",
      action: () => setShortcutsOpen(prev => !prev),
      // No allowInInput — conflicts with typing "?"
    },
    {
      key: "escape",
      labelKey: "shortcuts.closeOverlay",
      action: () => {
        // Let context menus handle their own Escape
        if (document.querySelector('[role="menu"]')) return false;
        // Cascade: close overlays first, then collapse chat panel
        if (menuOpenRef.current) {
          clearTimeout(menuTimerRef.current);
          setMenuClosing(false);
          setMenuOpen(false);
          hamburgerRef.current?.focus();
        } else if (shortcutsOpenRef.current || aboutOpenRef.current || memoryOpenRef.current) {
          setShortcutsOpen(false);
          setAboutOpen(false);
          setMemoryOpen(false);
        } else if (chatExpandedRef.current) {
          setChatExpanded(false);
          // Blur textarea so focus doesn't remain on hidden input
          (document.activeElement as HTMLElement)?.blur?.();
        } else {
          return false; // nothing to close, let event propagate
        }
      },
      allowInInput: true,
    },
    // Fully stable: micOn read via micOnRef, startMic/stopMic are stable
    // VADActions callbacks, createNewChat uses refs internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [startMic, stopMic, createNewChat]);

  useKeyboardShortcuts(shortcuts);
  useAffinityIdleExpression();

  return (
    <>
      {/* ===== Desktop split layout (≥ 1024px) ===== */}
      {isDesktop ? (
        <SplitLayout firstMinutePhase={firstMinutePhase} />
      ) : (
        <OverlayLayout
          isMobile={isMobile}
          chatExpanded={chatExpanded}
          kbOffset={kbOffset}
          menuOpen={menuOpen}
          menuClosing={menuClosing}
          showCreditsBadge={showCreditsBadge}
          memoryOpen={memoryOpen}
          aboutOpen={aboutOpen}
          toggleChat={toggleChat}
          collapseChat={collapseChat}
          openMenu={openMenu}
          closeMenu={closeMenu}
          openMemory={openMemory}
          openAbout={openAbout}
          handleMenuKeyDown={handleMenuKeyDown}
          handleExpandKeyDown={handleExpandKeyDown}
          hamburgerRef={hamburgerRef}
          menuPanelRef={menuPanelRef}
          firstMinutePhase={firstMinutePhase}
        />
      )}

      {/* ===== Layer 99: 快捷键帮助浮层 (shared across both layouts) ===== */}
      {shortcutsOpen && (
        <SectionErrorBoundary name="ShortcutsOverlay">
          <Suspense fallback={null}>
            <ShortcutsOverlay open={shortcutsOpen} onClose={closeShortcuts} />
          </Suspense>
        </SectionErrorBoundary>
      )}
      {aboutOpen && (
        <SectionErrorBoundary name="AboutOverlay">
          <Suspense fallback={null}>
            <AboutOverlay open={aboutOpen} onClose={closeAbout} />
          </Suspense>
        </SectionErrorBoundary>
      )}
      {memoryOpen && (
        <SectionErrorBoundary name="MemoryPanel">
          <Suspense fallback={null}>
            <MemoryPanel open={memoryOpen} onClose={closeMemory} />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </>
  );
}

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

/** 主应用（包含 Landing + 所有 Providers） */
function MainApp() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading } = useAuthState();
  const currentLocale = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? LOCALE_MAP[i18n.language as SupportedLanguage]
    : "en_US";
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem(SS_VISITED);
  });
  const [landingExiting, setLandingExiting] = useState(false);
  useCheckoutCallback();

  const landingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(landingTimerRef.current); }, []);

  const handleLandingComplete = useCallback(() => {
    setLandingExiting(true);
    sessionStorage.setItem(SS_VISITED, 'true');
    window.dispatchEvent(new Event('ling-landing-complete'));
    landingTimerRef.current = setTimeout(() => {
      setShowLanding(false);
    }, 700);
  }, []);

  // Determine which view to show after overture:
  // - Authenticated → MainContent (SplitLayout/OverlayLayout)
  // - Unauthenticated (and not loading) → WitnessMode
  const showWitnessMode = !isAuthenticated && !isLoading && !showLanding;

  // Crossfade between Witness Mode and Console Mode.
  // On auth state change (login/logout without full reload), the old view fades
  // out over 400ms, then the new view fades in over 400ms (mode="wait" style).
  // OAuth redirects cause a full page reload so the crossfade won't play there,
  // but it covers: logout, future non-redirect auth flows, and SSR hydration.
  const modeKey = showWitnessMode ? 'witness' : 'console';
  const { renderKey: activeMode, style: crossfadeStyle } = useCrossfade(modeKey);

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
        <div style={crossfadeStyle}>
          {activeMode === 'witness' ? (
            /* Unauthenticated: Witness Mode — silhouette + daily statement + CTA */
            <Suspense fallback={null}>
              <WitnessMode />
            </Suspense>
          ) : (
            <div style={landingExiting || !showLanding ? S_MAIN_VISIBLE : S_MAIN_HIDDEN}>
              <MainContent />
            </div>
          )}
        </div>

        {showLanding && (
          <Suspense fallback={null}>
            <LandingAnimation onComplete={handleLandingComplete} />
          </Suspense>
        )}

        {isAuthenticated && (
          <SectionErrorBoundary name="BillingOverlays">
            <Suspense fallback={null}>
              <PricingOverlay />
              <InsufficientCreditsModal />
            </Suspense>
          </SectionErrorBoundary>
        )}
        {/* PersonalizedOnboarding removed — Ling's first chat message is the onboarding */}
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
