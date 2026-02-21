import { useState, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { LandingAnimation } from "./components/landing/LandingAnimation";
import { AiStateProvider } from "./context/ai-state-context";
import { Live2DConfigProvider } from "./context/live2d-config-context";
import { SubtitleProvider } from "./context/subtitle-context";
import { BgUrlProvider } from "./context/bgurl-context";
import WebSocketHandler from "./services/websocket-handler";
import { CameraProvider } from "./context/camera-context";
import { ChatHistoryProvider, useChatMessages, useHistoryList } from "./context/chat-history-context";
import { CharacterConfigProvider } from "./context/character-config-context";
import { VADProvider, useVAD } from "./context/vad-context";
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
import { AffinityBar } from "./components/status/AffinityBar";
import { ConnectionStatus } from "./components/status/ConnectionStatus";
import { AffinityProvider } from "./context/affinity-context";
import { ToolStateProvider } from "./context/tool-state-context";
import { TTSStateProvider } from "./context/tts-state-context";
import { StarField } from "./components/background/StarField";
import { MOBILE_BREAKPOINT } from "./constants/breakpoints";
import { SEO_HOME_TITLE, SEO_HOME_DESC, SEO_HOME_OG_TITLE } from "./constants/brand";
import { BackgroundReactor } from "./components/effects/BackgroundReactor";
import { AudioVisualizer } from "./components/effects/AudioVisualizer";
import { CrystalField } from "./components/crystal/CrystalField";
import { Constellation } from "./components/ability/Constellation";
import { LoadingSkeleton } from "./components/loading/LoadingSkeleton";
import { Toaster, toaster } from "./components/ui/toaster";
import { useWebSocket } from "./context/websocket-context";
import { useKeyboardShortcuts, ShortcutDef } from "./hooks/use-keyboard-shortcuts";
import { ShortcutsOverlay } from "./components/shortcuts/ShortcutsOverlay";
import { AboutOverlay } from "./components/about/AboutOverlay";
import { NetworkStatusBanner } from "./components/effects/NetworkStatusBanner";
import { TapParticles } from "./components/effects/TapParticles";
import { useAffinityIdleExpression } from "./hooks/use-affinity-idle-expression";
import { AuthProvider, useAuth } from "./context/auth-context";
import { UIProvider, useUI } from "./context/ui-context";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TermsPage } from "./pages/TermsPage";
import CreditsDisplay from "./components/billing/CreditsDisplay";
import PricingOverlay from "./components/billing/PricingOverlay";
import InsufficientCreditsModal from "./components/billing/InsufficientCreditsModal";
import { PersonalizedOnboarding, shouldShowOnboarding } from "./components/onboarding/PersonalizedOnboarding";
import { MemoryPanel } from "./components/memory/MemoryPanel";
import "./index.css";

// Error Boundary
interface ErrorBoundaryState { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; showDetail: boolean; }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, error: null, errorInfo: null, showDetail: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { this.setState({ errorInfo }); console.error('[ErrorBoundary]', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      const btnBase: React.CSSProperties = { padding: '10px 24px', borderRadius: 8, fontSize: 14, cursor: 'pointer', border: 'none', transition: 'opacity 0.2s' };
      return (
        <div style={{ width: '100vw', height: '100vh', background: '#0a0015', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
          <div style={{ maxWidth: 'min(440px, calc(100vw - 32px))', textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>:(</div>
            <h2 style={{ color: '#c4b5fd', marginBottom: 8, fontSize: 20, fontWeight: 600 }}>{i18next.t('error.pageCrashTitle')}</h2>
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
              <pre style={{ marginTop: 12, textAlign: 'left', color: 'rgba(255,107,107,0.7)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8 }}>
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

function MainContent(): JSX.Element {
  const { t } = useTranslation();
  const [chatExpanded, setChatExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);

  // Contexts for keyboard shortcuts
  const { micOn, startMic, stopMic } = useVAD();
  const { sendMessage } = useWebSocket();
  const { interrupt } = useInterrupt();
  const { messages } = useChatMessages();
  const { currentHistoryUid, updateHistoryList } = useHistoryList();

  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
      // When keyboard opens, visualViewport.height < window.innerHeight
      // The offset from the bottom tells us how much the keyboard covers
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(Math.max(0, offset));
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const toggleChat = useCallback(() => {
    setChatExpanded(prev => !prev);
  }, []);

  const createNewChat = useCallback(() => {
    if (currentHistoryUid && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      updateHistoryList(currentHistoryUid, latestMessage);
    }
    interrupt();
    sendMessage({ type: "create-new-history" });
  }, [currentHistoryUid, messages, updateHistoryList, interrupt, sendMessage]);

  // Keyboard shortcuts definition
  const shortcuts: ShortcutDef[] = useMemo(() => [
    {
      key: "mod+m",
      labelKey: "shortcuts.toggleMic",
      action: () => { micOn ? stopMic() : startMic(); },
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
      allowInInput: true,
    },
    {
      key: "shift+?",
      labelKey: "shortcuts.showHelp",
      action: () => setShortcutsOpen(prev => !prev),
      allowInInput: true,
    },
    {
      key: "escape",
      labelKey: "shortcuts.closeOverlay",
      action: () => { setShortcutsOpen(false); setAboutOpen(false); setMemoryOpen(false); },
      allowInInput: true,
    },
  ], [micOn, startMic, stopMic, createNewChat, t]);

  useKeyboardShortcuts(shortcuts);
  useAffinityIdleExpression();

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        width: "100vw",
        background: "#0a0015",
        overflow: "hidden",
      }}
    >
      {/* ===== Layer -1: 星空背景 ===== */}
      <div style={{ position: "absolute", inset: 0, zIndex: -1 }}>
        <StarField />
      </div>

      {/* ===== Layer 0: Live2D 全屏 ===== */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Live2D />
      </div>

      {/* ===== Layer 0+: Live2D 点击粒子 ===== */}
      <TapParticles />

      {/* ===== Layer 0.5: 工具状态反馈层 ===== */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
        <BackgroundReactor />
        <AudioVisualizer />
      </div>

      {/* ===== Layer 0.8: 加载骨架屏 ===== */}
      <LoadingSkeleton />

      {/* Live2D 已有内置 loading overlay (live2d.tsx)，不需要额外的 */}

      {/* ===== Layer 1: 工具结果水晶 ===== */}
      <CrystalField />

      {/* ===== Layer 1.8: 底部渐变遮罩 (Ground Plane) ===== */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: "45dvh", zIndex: 22, pointerEvents: "none",
        background: "linear-gradient(to bottom, transparent 0%, rgba(10,0,21,0.15) 30%, rgba(10,0,21,0.45) 60%, rgba(10,0,21,0.65) 100%)",
      }} />

      {/* ===== Layer 1.5: 右侧工具栏 ===== */}
      <div
        style={{
          position: "absolute",
          top: isMobile ? "8px" : "16px",
          right: isMobile ? "8px" : "12px",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isMobile ? "8px" : "12px",
        }}
      >
        <CreditsDisplay />
        <AffinityBadge />
        <ConnectionStatus />
        <button
          onClick={toggleChat}
          aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
          aria-pressed={chatExpanded}
          title={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
          style={{
            width: isMobile ? "44px" : "42px",
            height: isMobile ? "44px" : "42px",
            borderRadius: "50%",
            background: chatExpanded ? "rgba(139, 92, 246, 0.4)" : "rgba(255, 255, 255, 0.08)",
            border: chatExpanded ? "1px solid rgba(139, 92, 246, 0.6)" : "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.3s ease, border-color 0.3s ease",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          onClick={() => setMemoryOpen(true)}
          aria-label="Memories"
          title="Memories"
          style={{
            width: isMobile ? "44px" : "42px",
            height: isMobile ? "44px" : "42px",
            borderRadius: "50%",
            background: memoryOpen ? "rgba(139, 92, 246, 0.4)" : "rgba(255, 255, 255, 0.08)",
            border: memoryOpen ? "1px solid rgba(139, 92, 246, 0.6)" : "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.3s ease, border-color 0.3s ease",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
            <path d="M8.24 4.47A4 4 0 0 1 12 2" />
            <path d="M12 9v1" />
            <path d="M4.93 4.93l.7.7" />
            <path d="M19.07 4.93l-.7.7" />
            <path d="M12 22c-4.97 0-9-2.69-9-6v-2c0-3.31 4.03-6 9-6s9 2.69 9 6v2c0 3.31-4.03 6-9 6z" />
          </svg>
        </button>
        <button
          onClick={() => setAboutOpen(true)}
          aria-label={t("shortcuts.showAbout")}
          title={t("shortcuts.showAbout")}
          style={{
            width: isMobile ? "44px" : "42px",
            height: isMobile ? "44px" : "42px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.3s ease",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>

      {/* ===== Layer 2: 浮动聊天区域 ===== */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
          transform: kbOffset > 0 ? `translateY(-${kbOffset}px)` : "none",
          transition: kbOffset > 0 ? "none" : "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            position: "relative",
            pointerEvents: "auto",
            transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            maxHeight: chatExpanded ? (isMobile ? "35dvh" : "40dvh") : "0px",
            opacity: chatExpanded ? 1 : 0,
            willChange: "max-height, opacity",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
          }}
        >
          <ChatArea />
        </div>

        {!chatExpanded && !isMobile && (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("ui.expandChat")}
            style={{
              pointerEvents: "auto",
              display: "flex",
              justifyContent: "center",
              padding: "6px 0",
              cursor: "pointer",
            }}
            onClick={toggleChat}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleChat(); } }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139, 92, 246, 0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        )}

        <div style={{ flexShrink: 0, pointerEvents: "auto", position: "relative" }}>
          {/* 星座 — 浮在 InputBar 左上方 */}
          {!isMobile && (
            <div style={{
              position: "absolute",
              bottom: "calc(100% + 12px)",
              left: 16,
              zIndex: 26,
              pointerEvents: "auto",
            }}>
              <Constellation />
            </div>
          )}
          <div style={{
            background: "rgba(10, 0, 21, 0.5)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderTop: "1px solid rgba(139, 92, 246, 0.15)",
          }}>
            <InputBar />
          </div>
        </div>

        <div style={{ flexShrink: 0, pointerEvents: "auto" }}>
          <AffinityBar />
        </div>
      </div>

      {/* ===== Layer 99: 快捷键帮助浮层 ===== */}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
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

/** 需要认证时包裹子组件，未登录跳转 /login */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null; // 初始化中不闪屏
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
                                      <div style={{
                                        opacity: landingExiting || !showLanding ? 1 : 0,
                                        transform: landingExiting || !showLanding ? 'scale(1)' : 'scale(0.97)',
                                        transition: 'opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                                      }}>
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
        <LandingAnimation onComplete={handleLandingComplete} />
      )}

      <PricingOverlay />
      <InsufficientCreditsModal />
      {showOnboarding && (
        <PersonalizedOnboarding onComplete={() => setShowOnboarding(false)} />
      )}
      </UIProvider>

      <NetworkStatusBanner />
      <Toaster />
    </>
  );
}

function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DismissFallback />
          <Routes>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/*" element={<MainApp />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
