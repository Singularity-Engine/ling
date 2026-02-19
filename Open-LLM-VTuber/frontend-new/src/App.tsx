import { useState, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LandingAnimation } from "./components/landing/LandingAnimation";
import { AiStateProvider } from "./context/ai-state-context";
import { Live2DConfigProvider } from "./context/live2d-config-context";
import { SubtitleProvider } from "./context/subtitle-context";
import { BgUrlProvider } from "./context/bgurl-context";
import WebSocketHandler from "./services/websocket-handler";
import { CameraProvider } from "./context/camera-context";
import { ChatHistoryProvider, useChatHistory } from "./context/chat-history-context";
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
import { BackgroundReactor } from "./components/effects/BackgroundReactor";
import { AudioVisualizer } from "./components/effects/AudioVisualizer";
import { CrystalField } from "./components/crystal/CrystalField";
import { CapabilityRing } from "./components/ability/CapabilityRing";
import { LoadingSkeleton } from "./components/loading/LoadingSkeleton";
import { ModelLoadingOverlay } from "./components/loading/ModelLoadingOverlay";
import { Toaster } from "./components/ui/toaster";
import { useWebSocket } from "./context/websocket-context";
import { useKeyboardShortcuts, ShortcutDef } from "./hooks/use-keyboard-shortcuts";
import { ShortcutsOverlay } from "./components/shortcuts/ShortcutsOverlay";
import { AboutOverlay } from "./components/about/AboutOverlay";
import { NetworkStatusBanner } from "./components/effects/NetworkStatusBanner";
import { TapParticles } from "./components/effects/TapParticles";
import { useAffinityIdleExpression } from "./hooks/use-affinity-idle-expression";
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
          <div style={{ maxWidth: 440, textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>:(</div>
            <h2 style={{ color: '#c4b5fd', marginBottom: 8, fontSize: 20, fontWeight: 600 }}>页面出了点问题</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              别担心，刷新一下通常就好了。<br />如果问题持续出现，可以尝试清除缓存。
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => window.location.reload()} style={{ ...btnBase, background: 'rgba(139,92,246,0.5)', color: '#fff' }}>
                刷新页面
              </button>
              <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ ...btnBase, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
                清除缓存并刷新
              </button>
            </div>
            <button
              onClick={() => this.setState({ showDetail: !this.state.showDetail })}
              style={{ marginTop: 20, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer' }}
            >
              {this.state.showDetail ? '收起详情' : '查看错误详情'}
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
  const [isMobile, setIsMobile] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);

  // Contexts for keyboard shortcuts
  const { micOn, startMic, stopMic } = useVAD();
  const { sendMessage } = useWebSocket();
  const { interrupt } = useInterrupt();
  const { currentHistoryUid, messages, updateHistoryList } = useChatHistory();

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
      action: () => { setShortcutsOpen(false); setAboutOpen(false); },
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
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        <BackgroundReactor />
        <AudioVisualizer />
      </div>

      {/* ===== Layer 0.8: 加载骨架屏 ===== */}
      <LoadingSkeleton />

      {/* ===== Layer 0.9: Live2D 模型加载覆盖层 ===== */}
      <ModelLoadingOverlay />

      {/* ===== Layer 1: 工具结果水晶 ===== */}
      <CrystalField />

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
        <AffinityBadge />
        <ConnectionStatus />
        <button
          onClick={toggleChat}
          aria-label={chatExpanded ? "收起对话" : "展开对话"}
          aria-pressed={chatExpanded}
          title={chatExpanded ? "收起对话" : "展开对话"}
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
            transition: "all 0.3s ease",
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
          bottom: kbOffset,
          left: 0,
          right: 0,
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
          transition: kbOffset > 0 ? "none" : "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            position: "relative",
            pointerEvents: "auto",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            maxHeight: chatExpanded ? (isMobile ? "35dvh" : "40dvh") : "0px",
            opacity: chatExpanded ? 1 : 0,
            maskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
          }}
        >
          <ChatArea />
        </div>

        <div style={{ pointerEvents: "auto" }}>
          {!isMobile && <CapabilityRing />}
        </div>

        {!chatExpanded && !isMobile && (
          <div
            role="button"
            tabIndex={0}
            aria-label="展开对话"
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

        <div
          style={{
            flexShrink: 0,
            pointerEvents: "auto",
            background: "rgba(10, 0, 21, 0.25)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderTop: "1px solid rgba(139, 92, 246, 0.1)",
          }}
        >
          <InputBar />
        </div>

        <div style={{ flexShrink: 0, pointerEvents: "auto" }}>
          <AffinityBar />
        </div>
      </div>

      {/* ===== Layer 99: 快捷键帮助浮层 ===== */}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function App(): JSX.Element {
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem('ling-visited');
  });
  const [landingExiting, setLandingExiting] = useState(false);

  const handleLandingComplete = useCallback(() => {
    setLandingExiting(true);
    // Signal websocket-handler that the user has finished the Landing animation
    // so it can now send the auto-greeting (avoids greeting arriving while Landing is still visible)
    window.dispatchEvent(new Event('ling-landing-complete'));
    setTimeout(() => {
      setShowLanding(false);
      sessionStorage.setItem('ling-visited', 'true');
    }, 700);
  }, []);

  return (
    <ErrorBoundary>
      {/* Always mount main content so it's ready behind landing */}
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

      {/* Landing overlay — fades out during crossfade */}
      {showLanding && (
        <LandingAnimation onComplete={handleLandingComplete} />
      )}

      <NetworkStatusBanner />
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
