import { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from "react";
import { LandingAnimation } from "./components/landing/LandingAnimation";
import { AiStateProvider } from "./context/ai-state-context";
import { Live2DConfigProvider } from "./context/live2d-config-context";
import { SubtitleProvider } from "./context/subtitle-context";
import { BgUrlProvider } from "./context/bgurl-context";
import WebSocketHandler from "./services/websocket-handler";
import { CameraProvider } from "./context/camera-context";
import { ChatHistoryProvider } from "./context/chat-history-context";
import { CharacterConfigProvider } from "./context/character-config-context";
import { VADProvider } from "./context/vad-context";
import { Live2D } from "./components/canvas/live2d";
import { ProactiveSpeakProvider } from "./context/proactive-speak-context";
import { ScreenCaptureProvider } from "./context/screen-capture-context";
import { GroupProvider } from "./context/group-context";
import { BrowserProvider } from "./context/browser-context";
import { ModeProvider } from "./context/mode-context";
import { ChatArea } from "./components/chat/ChatArea";
import { InputBar } from "./components/chat/InputBar";
import { AffinityBadge } from "./components/status/AffinityBadge";
import { AffinityBar } from "./components/status/AffinityBar";
import { ConnectionStatus } from "./components/status/ConnectionStatus";
import { AffinityProvider } from "./context/affinity-context";
import { ToolStateProvider } from "./context/tool-state-context";
import { StarField } from "./components/background/StarField";
import { BackgroundReactor } from "./components/effects/BackgroundReactor";
import { ThoughtHalo } from "./components/effects/ThoughtHalo";
import { CrystalField } from "./components/crystal/CrystalField";
import { CapabilityRing } from "./components/ability/CapabilityRing";
import "./index.css";

// Error Boundary
interface ErrorBoundaryState { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { this.setState({ errorInfo }); console.error('[ErrorBoundary]', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (<div style={{ width: '100vw', height: '100vh', background: '#0a0015', color: '#ff6b6b', padding: 20, fontFamily: 'monospace', fontSize: 13, overflow: 'auto', wordBreak: 'break-all' }}>
        <h2 style={{ color: '#c4b5fd', marginBottom: 12 }}>⚠️ 渲染错误</h2>
        <p>{this.state.error?.toString()}</p>
        <pre style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, whiteSpace: 'pre-wrap', fontSize: 11 }}>{this.state.errorInfo?.componentStack}</pre>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ marginTop: 16, padding: '10px 24px', background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.6)', borderRadius: 8, color: '#c4b5fd', fontSize: 14, cursor: 'pointer' }}>清除缓存并刷新</button>
      </div>);
    }
    return this.props.children;
  }
}

function MainContent(): JSX.Element {
  const [chatExpanded, setChatExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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

  const toggleChat = useCallback(() => {
    setChatExpanded(prev => !prev);
  }, []);

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

      {/* ===== Layer 0.5: 工具状态反馈层 ===== */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        <BackgroundReactor />
        <ThoughtHalo />
      </div>

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
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
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
    </div>
  );
}

function App(): JSX.Element {
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem('ling-visited');
  });
  const [landingExiting, setLandingExiting] = useState(false);

  const handleLandingComplete = useCallback(() => {
    // Start crossfade: keep both mounted, fade landing out while main fades in
    setLandingExiting(true);
    // Wait for the crossfade to finish, then unmount landing
    setTimeout(() => {
      setShowLanding(false);
      sessionStorage.setItem('ling-visited', 'true');
    }, 600);
  }, []);

  return (
    <ErrorBoundary>
      {/* Always mount main content so it's ready behind landing */}
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
                                  <AffinityProvider>
                                    <WebSocketHandler>
                                      <div style={{
                                        opacity: landingExiting || !showLanding ? 1 : 0,
                                        transition: 'opacity 0.6s ease-in',
                                      }}>
                                        <MainContent />
                                      </div>
                                    </WebSocketHandler>
                                  </AffinityProvider>
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

      {/* Landing overlay — fades out during crossfade */}
      {showLanding && (
        <LandingAnimation onComplete={handleLandingComplete} />
      )}
    </ErrorBoundary>
  );
}

export default App;
