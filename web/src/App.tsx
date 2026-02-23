import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, Component, ErrorInfo, type ReactNode, type CSSProperties } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
// Lazy-loaded: only shown on first visit (before sessionStorage 'ling-visited' is set).
// Avoids bundling the particle canvas + typewriter animation code for returning visitors.
const LandingAnimation = lazy(() => import("./components/landing/LandingAnimation").then(m => ({ default: m.LandingAnimation })));
import { AiStateProvider } from "./context/ai-state-context";
import { Live2DConfigProvider } from "./context/live2d-config-context";
import { SubtitleProvider } from "./context/subtitle-context";
import { BgUrlProvider } from "./context/bgurl-context";
import WebSocketHandler from "./services/websocket-handler";
import { CameraProvider } from "./context/camera-context";
import { ChatHistoryProvider, useChatMessagesState, useHistoryList } from "./context/chat-history-context";
import { CharacterConfigProvider } from "./context/character-config-context";
import { VADProvider, useVADState, useVADActions } from "./context/vad-context";
import { Live2D, useInterrupt } from "./components/canvas/live2d";
import { ProactiveSpeakProvider } from "./context/proactive-speak-context";
import { ScreenCaptureProvider } from "./context/screen-capture-context";
import { GroupProvider } from "./context/group-context";
import { BrowserProvider } from "./context/browser-context";
import { ModeProvider } from "./context/mode-context";
import { ThemeProvider } from "./context/theme-context";
import { ChatArea } from "./components/chat/ChatArea";
import { InputBar } from "./components/chat/InputBar";
import { AffinityBadge } from "./components/status/AffinityBadge";
import { ConnectionStatus } from "./components/status/ConnectionStatus";
import { AffinityProvider } from "./context/affinity-context";
import { ToolStateProvider } from "./context/tool-state-context";
import { TTSStateProvider } from "./context/tts-state-context";
import { StarField } from "./components/background/StarField";
import { SEO_HOME_TITLE, SEO_HOME_DESC, SEO_HOME_OG_TITLE } from "./constants/brand";
import { BackgroundReactor } from "./components/effects/BackgroundReactor";
import { AudioVisualizer } from "./components/effects/AudioVisualizer";
import { CrystalField } from "./components/crystal/CrystalField";
import { Constellation } from "./components/ability/Constellation";
import { LoadingSkeleton } from "./components/loading/LoadingSkeleton";
import { Toaster, toaster } from "./components/ui/toaster";
import { useWebSocketActions } from "./context/websocket-context";
import { useKeyboardShortcuts, ShortcutDef } from "./hooks/use-keyboard-shortcuts";
import { NetworkStatusBanner } from "./components/effects/NetworkStatusBanner";
import { TapParticles } from "./components/effects/TapParticles";
import { useAffinityIdleExpression } from "./hooks/use-affinity-idle-expression";
import { useIsMobile } from "./hooks/use-is-mobile";
import { AuthProvider, useAuth } from "./context/auth-context";
import { UIProvider } from "./context/ui-context";
import CreditsDisplay from "./components/billing/CreditsDisplay";
import { ExperimentBar } from "./components/experiment/ExperimentBar";
import { SectionErrorBoundary } from "./components/error/SectionErrorBoundary";
import { createLogger } from "./utils/logger";
import { OVERLAY_COLORS, WHITE_ALPHA, MISC_COLORS } from "./constants/colors";
import "./index.css";

// ─── Lazy-loaded overlays & modals (chunk loads on first use) ───
const ShortcutsOverlay = lazy(() => import("./components/shortcuts/ShortcutsOverlay").then(m => ({ default: m.ShortcutsOverlay })));
const AboutOverlay = lazy(() => import("./components/about/AboutOverlay").then(m => ({ default: m.AboutOverlay })));
const MemoryPanel = lazy(() => import("./components/memory/MemoryPanel").then(m => ({ default: m.MemoryPanel })));
const PricingOverlay = lazy(() => import("./components/billing/PricingOverlay"));
const InsufficientCreditsModal = lazy(() => import("./components/billing/InsufficientCreditsModal"));
const PersonalizedOnboarding = lazy(() => import("./components/onboarding/PersonalizedOnboarding").then(m => ({ default: m.PersonalizedOnboarding })));

// ─── Lazy-loaded route pages ───
const LoginPage = lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const TermsPage = lazy(() => import("./pages/TermsPage").then(m => ({ default: m.TermsPage })));

// Inlined to avoid eagerly importing the full onboarding module
const shouldShowOnboarding = () => !sessionStorage.getItem("ling-onboarding-done");

const rootLog = createLogger("App");

// Error Boundary
interface ErrorBoundaryState { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; showDetail: boolean; }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, error: null, errorInfo: null, showDetail: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { this.setState({ errorInfo }); rootLog.error('Root crash:', error, errorInfo.componentStack); }
  render() {
    if (this.state.hasError) {
      const btnBase: React.CSSProperties = { padding: '10px 24px', borderRadius: 8, fontSize: 14, cursor: 'pointer', border: 'none', transition: 'opacity 0.2s' };
      return (
        <div style={{ width: '100vw', height: '100vh', background: '#0a0015', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
          <div style={{ maxWidth: 'min(440px, calc(100vw - 32px))', textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>:(</div>
            <h2 style={{ color: 'var(--ling-purple-lighter)', marginBottom: 8, fontSize: 20, fontWeight: 600 }}>{i18next.t('error.pageCrashTitle')}</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              {i18next.t('error.pageCrashLine1')}<br />{i18next.t('error.pageCrashLine2')}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => window.location.reload()} style={{ ...btnBase, background: 'rgba(139,92,246,0.5)', color: '#fff' }}>
                {i18next.t('error.refreshPage')}
              </button>
              <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ ...btnBase, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {i18next.t('error.clearCacheRefresh')}
              </button>
            </div>
            <button
              onClick={() => this.setState({ showDetail: !this.state.showDetail })}
              style={{ marginTop: 20, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer' }}
            >
              {this.state.showDetail ? i18next.t('error.hideDetails') : i18next.t('error.showErrorDetails')}
            </button>
            {this.state.showDetail && (
              <pre style={{ marginTop: 12, textAlign: 'left', color: 'rgba(255,107,107,0.7)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', background: MISC_COLORS.ERROR_BG, padding: 12, borderRadius: 8 }}>
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

// ─── Static style constants (avoid per-render allocation in MainContent) ───

const S_ROOT: CSSProperties = {
  position: "relative", height: "100dvh", width: "100vw",
  background: "#0a0015", overflow: "hidden",
};
const S_LAYER_STARFIELD: CSSProperties = { position: "absolute", inset: 0, zIndex: -1 };
const S_LAYER_LIVE2D: CSSProperties = { position: "absolute", inset: 0, zIndex: 0 };
const S_LAYER_EFFECTS: CSSProperties = { position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" };

const S_GROUND_GRADIENT: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0,
  height: "44dvh", zIndex: 22, pointerEvents: "none",
  background: "linear-gradient(to bottom, transparent 0%, rgba(10,0,21,0.02) 12%, rgba(10,0,21,0.07) 24%, rgba(10,0,21,0.16) 36%, rgba(10,0,21,0.28) 48%, rgba(10,0,21,0.42) 60%, rgba(10,0,21,0.56) 72%, rgba(10,0,21,0.68) 84%, rgba(10,0,21,0.78) 94%, rgba(10,0,21,0.82) 100%)",
};

// Right toolbar positioning — desktop / mobile variants
const S_TOOLBAR_D: CSSProperties = {
  position: "absolute", top: "52px", right: "12px", zIndex: 20,
  display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
};
const S_TOOLBAR_M: CSSProperties = {
  position: "absolute",
  top: "max(44px, calc(env(safe-area-inset-top, 0px) + 36px))",
  right: "max(8px, env(safe-area-inset-right, 0px))",
  zIndex: 20,
  display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
};

// Status / action group capsules
const _GROUP_BASE: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "6px", borderRadius: "20px",
  background: OVERLAY_COLORS.LIGHT, border: `1px solid ${WHITE_ALPHA.LIGHT_BORDER}`,
};
const S_GROUP_D: CSSProperties = { ..._GROUP_BASE, gap: "8px" };
const S_GROUP_M: CSSProperties = { ..._GROUP_BASE, gap: "6px" };

// Action button style variants (mobile/desktop × active/inactive)
const _ACTION_BTN: CSSProperties = {
  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "background 0.3s ease, border-color 0.3s ease",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: 0,
};
const S_BTN_D_OFF: CSSProperties = { ..._ACTION_BTN, width: "42px", height: "42px", background: WHITE_ALPHA.BUTTON_BG, border: `1px solid ${WHITE_ALPHA.BORDER}` };
const S_BTN_D_ON: CSSProperties = { ..._ACTION_BTN, width: "42px", height: "42px", background: "rgba(139,92,246,0.4)", border: "1px solid rgba(139,92,246,0.6)" };
const S_BTN_M_OFF: CSSProperties = { ..._ACTION_BTN, width: "44px", height: "44px", background: WHITE_ALPHA.BUTTON_BG, border: `1px solid ${WHITE_ALPHA.BORDER}` };
const S_BTN_M_ON: CSSProperties = { ..._ACTION_BTN, width: "44px", height: "44px", background: "rgba(139,92,246,0.4)", border: "1px solid rgba(139,92,246,0.6)" };
function btnStyle(mobile: boolean, active: boolean): CSSProperties {
  if (mobile) return active ? S_BTN_M_ON : S_BTN_M_OFF;
  return active ? S_BTN_D_ON : S_BTN_D_OFF;
}

// Chat area expand/collapse variants
const _CHAT_INNER: CSSProperties = {
  overflow: "hidden", position: "relative", pointerEvents: "auto",
  transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  willChange: "max-height, opacity",
  maskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
};
const S_CHAT_D_OPEN: CSSProperties = { ..._CHAT_INNER, maxHeight: "40dvh", opacity: 1 };
const S_CHAT_M_OPEN: CSSProperties = { ..._CHAT_INNER, maxHeight: "35dvh", opacity: 1 };
const S_CHAT_CLOSED: CSSProperties = { ..._CHAT_INNER, maxHeight: "0px", opacity: 0 };
function chatInnerStyle(mobile: boolean, expanded: boolean): CSSProperties {
  if (!expanded) return S_CHAT_CLOSED;
  return mobile ? S_CHAT_M_OPEN : S_CHAT_D_OPEN;
}

// Chat area outer — base for useMemo (kbOffset is numeric, needs runtime style)
const S_CHAT_OUTER_BASE: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25,
  display: "flex", flexDirection: "column", pointerEvents: "none",
};

const S_EXPAND_HANDLE: CSSProperties = {
  pointerEvents: "auto", display: "flex", justifyContent: "center",
  padding: "6px 0", cursor: "pointer",
};
const S_INPUT_SECTION: CSSProperties = { flexShrink: 0, pointerEvents: "auto", position: "relative" as const };
const S_CONSTELLATION_POS: CSSProperties = {
  position: "absolute", bottom: "calc(100% + 12px)", left: 16, zIndex: 26, pointerEvents: "auto",
};
const S_INPUT_BAR_BG: CSSProperties = {
  background: "rgba(10, 0, 21, 0.55)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
  borderTop: "1px solid rgba(139, 92, 246, 0.15)",
};

// Landing → main content transition
const S_MAIN_VISIBLE: CSSProperties = {
  opacity: 1, transform: "scale(1)",
  transition: "opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
};
const S_MAIN_HIDDEN: CSSProperties = {
  opacity: 0, transform: "scale(0.97)",
  transition: "opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
};

// Pre-created SVG icon elements — shared across all renders
const ICON_CHAT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ICON_MEMORY = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
    <path d="M8.24 4.47A4 4 0 0 1 12 2" />
    <path d="M12 9v1" />
    <path d="M4.93 4.93l.7.7" />
    <path d="M19.07 4.93l-.7.7" />
    <path d="M12 22c-4.97 0-9-2.69-9-6v-2c0-3.31 4.03-6 9-6s9 2.69 9 6v2c0 3.31-4.03 6-9 6z" />
  </svg>
);
const ICON_INFO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const ICON_CHEVRON_UP = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

function MainContent(): JSX.Element {
  const { t } = useTranslation();
  const [chatExpanded, setChatExpanded] = useState(true);
  const isMobile = useIsMobile();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);

  // Contexts for keyboard shortcuts
  const { micOn } = useVADState();
  const { startMic, stopMic } = useVADActions();
  const { sendMessage } = useWebSocketActions();
  const { interrupt } = useInterrupt();
  const { messages } = useChatMessagesState();
  const { currentHistoryUid, updateHistoryList } = useHistoryList();

  // Ref mirrors so createNewChat and shortcuts stay stable across state changes.
  // Without this, every new chat message or mic toggle recreates callbacks →
  // rebuilds the shortcuts useMemo array, wasting work on every state change.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const historyUidRef = useRef(currentHistoryUid);
  historyUidRef.current = currentHistoryUid;
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;

  // Update --vh CSS variable on resize (used for mobile viewport height).
  // isMobile detection is handled by the shared useIsMobile() hook.
  useEffect(() => {
    const updateVh = () => {
      document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    };
    updateVh();
    let rafId = 0;
    const throttled = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; updateVh(); });
    };
    window.addEventListener("resize", throttled);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", throttled);
    };
  }, []);

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

  // Stable open/close handlers — prevents defeating memo on ShortcutsOverlay, AboutOverlay, MemoryPanel
  const openMemory = useCallback(() => setMemoryOpen(true), []);
  const openAbout = useCallback(() => setAboutOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeMemory = useCallback(() => setMemoryOpen(false), []);
  const handleExpandKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleChat(); }
  }, [toggleChat]);

  const createNewChat = useCallback(() => {
    if (historyUidRef.current && messagesRef.current.length > 0) {
      const latestMessage = messagesRef.current[messagesRef.current.length - 1];
      updateHistoryList(historyUidRef.current, latestMessage);
    }
    interrupt();
    sendMessage({ type: "create-new-history" });
  }, [updateHistoryList, interrupt, sendMessage]);

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
      action: () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".ling-textarea");
        textarea?.focus();
      },
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
        if (shortcutsOpenRef.current || aboutOpenRef.current || memoryOpenRef.current) {
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

  // Memoize only the kbOffset-dependent style (numeric, can't pre-compute variants)
  const chatOuterStyle = useMemo<CSSProperties>(() => ({
    ...S_CHAT_OUTER_BASE,
    transform: kbOffset > 0 ? `translateY(-${kbOffset}px)` : "none",
    transition: kbOffset > 0 ? "none" : "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  }), [kbOffset]);

  return (
    <div style={S_ROOT}>
      {/* ===== Layer -2: 实验状态栏 ===== */}
      <ExperimentBar />

      {/* ===== Layer -1: 星空背景 ===== */}
      <div style={S_LAYER_STARFIELD}>
        <StarField />
      </div>

      {/* ===== Layer 0: Live2D 全屏 ===== */}
      <SectionErrorBoundary name="Live2D">
        <div style={S_LAYER_LIVE2D}>
          <Live2D />
        </div>
      </SectionErrorBoundary>

      {/* ===== Layer 0+: Live2D 点击粒子 ===== */}
      <TapParticles />

      {/* ===== Layer 0.5: 工具状态反馈层 ===== */}
      <SectionErrorBoundary name="Effects">
        <div style={S_LAYER_EFFECTS}>
          <BackgroundReactor />
          <AudioVisualizer />
        </div>
      </SectionErrorBoundary>

      {/* ===== Layer 0.8: 加载骨架屏 ===== */}
      <LoadingSkeleton />

      {/* Live2D 已有内置 loading overlay (live2d.tsx)，不需要额外的 */}

      {/* ===== Layer 1: 工具结果水晶 ===== */}
      <SectionErrorBoundary name="CrystalField">
        <CrystalField />
      </SectionErrorBoundary>

      {/* ===== Layer 1.8: 底部渐变遮罩 (Ground Plane) ===== */}
      <div style={S_GROUND_GRADIENT} />

      {/* ===== Layer 1.5: 右侧工具栏 ===== */}
      <div style={isMobile ? S_TOOLBAR_M : S_TOOLBAR_D}>
        {/* ── Status indicators group ── */}
        <div style={isMobile ? S_GROUP_M : S_GROUP_D}>
          <CreditsDisplay />
          <AffinityBadge />
          <ConnectionStatus />
        </div>

        {/* ── Action buttons group ── */}
        <div style={isMobile ? S_GROUP_M : S_GROUP_D}>
          <button
            className="ling-action-btn"
            data-active={chatExpanded}
            onClick={toggleChat}
            aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
            aria-pressed={chatExpanded}
            title={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
            style={btnStyle(isMobile, chatExpanded)}
          >
            {ICON_CHAT}
          </button>
          <button
            className="ling-action-btn"
            data-active={memoryOpen}
            onClick={openMemory}
            aria-label="Memories"
            title="Memories"
            style={btnStyle(isMobile, memoryOpen)}
          >
            {ICON_MEMORY}
          </button>
          <button
            className="ling-action-btn"
            data-active={aboutOpen}
            onClick={openAbout}
            aria-label={t("shortcuts.showAbout")}
            title={t("shortcuts.showAbout")}
            style={btnStyle(isMobile, aboutOpen)}
          >
            {ICON_INFO}
          </button>
        </div>
      </div>

      {/* ===== Layer 2: 浮动聊天区域 ===== */}
      <div style={chatOuterStyle}>
        <div style={chatInnerStyle(isMobile, chatExpanded)}>
          <SectionErrorBoundary name="ChatArea" fallback={
            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
              {t("error.chatRenderFailed")}
            </div>
          }>
            <ChatArea />
          </SectionErrorBoundary>
        </div>

        {!chatExpanded && !isMobile && (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("ui.expandChat")}
            style={S_EXPAND_HANDLE}
            onClick={toggleChat}
            onKeyDown={handleExpandKeyDown}
          >
            {ICON_CHEVRON_UP}
          </div>
        )}

        <div style={S_INPUT_SECTION}>
          {/* 星座 — 浮在 InputBar 左上方 */}
          {!isMobile && (
            <div style={S_CONSTELLATION_POS}>
              <Constellation />
            </div>
          )}
          <div style={S_INPUT_BAR_BG}>
            <InputBar />
          </div>
        </div>

      </div>

      {/* ===== Layer 99: 快捷键帮助浮层 (lazy-loaded on first open) ===== */}
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
    </div>
  );
}

/**
 * 隐藏 index.html 中的 #loading-fallback。
 * 放在 AuthProvider 内部，当 auth 初始化完成后平滑淡出 fallback。
 */
function DismissFallback() {
  const { isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading) {
      const el = document.getElementById('loading-fallback');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
      }
    }
  }, [isLoading]);
  return null;
}

/** 已登录时阻止访问 login/register */
function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** 处理 Stripe checkout 回调 */
function useCheckoutCallback() {
  const { refreshUser } = useAuth();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      toaster.create({ title: 'Payment successful! Welcome aboard.', type: 'success', duration: 5000 });
      refreshUser();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkout === 'canceled') {
      toaster.create({ title: 'Checkout canceled. You can try again anytime.', type: 'info', duration: 3000 });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshUser]);
}

/** 主应用（包含 Landing + 所有 Providers） */
function MainApp() {
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem('ling-visited');
  });
  const [landingExiting, setLandingExiting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // If landing is skipped (returning visitor), check onboarding immediately
    return sessionStorage.getItem('ling-visited') ? shouldShowOnboarding() : false;
  });
  useCheckoutCallback();

  const closeOnboarding = useCallback(() => setShowOnboarding(false), []);

  const handleLandingComplete = useCallback(() => {
    setLandingExiting(true);
    sessionStorage.setItem('ling-visited', 'true');
    window.dispatchEvent(new Event('ling-landing-complete'));
    setTimeout(() => {
      setShowLanding(false);
      // After landing animation, check if onboarding should show
      if (shouldShowOnboarding()) {
        setShowOnboarding(true);
      }
    }, 700);
  }, []);

  return (
    <>
      <Helmet>
        <title>{SEO_HOME_TITLE}</title>
        <meta name="description" content={SEO_HOME_DESC} />
        <meta property="og:title" content={SEO_HOME_OG_TITLE} />
        <meta property="og:description" content={SEO_HOME_DESC} />
        <meta property="og:image" content="https://sngxai.com/og-image.png" />
        <link rel="canonical" href="https://sngxai.com/" />
      </Helmet>
      <UIProvider>
      <ThemeProvider>
      <ModeProvider>
        <CameraProvider>
          <ScreenCaptureProvider>
            <CharacterConfigProvider>
              <ChatHistoryProvider>
                <AiStateProvider>
                  <ProactiveSpeakProvider>
                    <Live2DConfigProvider>
                      <SubtitleProvider>
                        <VADProvider>
                          <BgUrlProvider>
                            <GroupProvider>
                              <BrowserProvider>
                                <ToolStateProvider>
                                  <TTSStateProvider>
                                  <AffinityProvider>
                                    <WebSocketHandler>
                                      <div style={landingExiting || !showLanding ? S_MAIN_VISIBLE : S_MAIN_HIDDEN}>
                                        <MainContent />
                                      </div>
                                    </WebSocketHandler>
                                  </AffinityProvider>
                                  </TTSStateProvider>
                                </ToolStateProvider>
                              </BrowserProvider>
                            </GroupProvider>
                          </BgUrlProvider>
                        </VADProvider>
                      </SubtitleProvider>
                    </Live2DConfigProvider>
                  </ProactiveSpeakProvider>
                </AiStateProvider>
              </ChatHistoryProvider>
            </CharacterConfigProvider>
          </ScreenCaptureProvider>
        </CameraProvider>
      </ModeProvider>
      </ThemeProvider>

      {showLanding && (
        <Suspense fallback={null}>
          <LandingAnimation onComplete={handleLandingComplete} />
        </Suspense>
      )}

      <SectionErrorBoundary name="BillingOverlays">
        <Suspense fallback={null}>
          <PricingOverlay />
          <InsufficientCreditsModal />
        </Suspense>
      </SectionErrorBoundary>
      {showOnboarding && (
        <SectionErrorBoundary name="Onboarding">
          <Suspense fallback={null}>
            <PersonalizedOnboarding onComplete={closeOnboarding} />
          </Suspense>
        </SectionErrorBoundary>
      )}
      </UIProvider>

      <NetworkStatusBanner />
      <Toaster />
    </>
  );
}

const pageTransition = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: 'easeInOut' },
} as const;

function AnimatedRoutes(): JSX.Element {
  const location = useLocation();
  // Normalize key so all catch-all paths share the same key (avoids spurious re-animation)
  const pageKey = ['/login', '/register', '/terms'].includes(location.pathname)
    ? location.pathname
    : '/';

  return (
    <AnimatePresence mode="wait">
      <motion.div key={pageKey} {...pageTransition} style={{ minHeight: '100dvh' }}>
        <Suspense fallback={null}>
          <Routes location={location}>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/*" element={<MainApp />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
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
