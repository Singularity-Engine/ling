import { Box, ChakraProvider, defaultSystem } from "@chakra-ui/react";
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
import { Toaster } from "./components/ui/toaster";
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

  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
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
    <Box
      position="relative"
      height="100vh"
      width="100vw"
      bg="#0a0015"
      overflow="hidden"
    >
      {/* ===== Layer -1: 星空背景 ===== */}
      <Box position="absolute" inset="0" zIndex={-1}>
        <StarField />
      </Box>

      {/* ===== Layer 0: Live2D 全屏 ===== */}
      <Box position="absolute" inset="0" zIndex={0}>
        <Live2D />
      </Box>

      {/* ===== Layer 0.5: 工具状态反馈层（背景光 + 思考光环） ===== */}
      <Box position="absolute" inset="0" zIndex={1} pointerEvents="none">
        <BackgroundReactor />
        <ThoughtHalo />
      </Box>

      {/* ===== Layer 1: 工具结果水晶（左右两侧浮动） ===== */}
      <CrystalField />

      {/* ===== Layer 1.5: 右侧工具栏 ===== */}
      <Box
        position="absolute"
        top="16px"
        right="12px"
        zIndex={20}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap="12px"
      >
        {/* 好感度徽章 */}
        <AffinityBadge />

        {/* 聊天展开/收起按钮 */}
        <Box
          as="button"
          onClick={toggleChat}
          w="42px" h="42px"
          borderRadius="50%"
          bg={chatExpanded ? "rgba(139, 92, 246, 0.4)" : "rgba(255, 255, 255, 0.08)"}
          border="1px solid"
          borderColor={chatExpanded ? "rgba(139, 92, 246, 0.6)" : "rgba(255, 255, 255, 0.12)"}
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          transition="all 0.3s ease"
          backdropFilter="blur(8px)"
          _hover={{ bg: "rgba(139, 92, 246, 0.3)" }}
          title={chatExpanded ? "收起对话" : "展开对话"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </Box>
      </Box>

      {/* ===== Layer 2: 浮动聊天区域 ===== */}
      <Box
        position="absolute"
        bottom="0"
        left="0"
        right="0"
        zIndex={25}
        display="flex"
        flexDirection="column"
        pointerEvents="none"
        transition="all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
      >
        {/* 对话气泡区 — 可展开/收起 */}
        <Box
          overflow="hidden"
          position="relative"
          pointerEvents="auto"
          transition="all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
          maxH={chatExpanded ? "50vh" : "0px"}
          opacity={chatExpanded ? 1 : 0}
          css={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
          }}
        >
          <ChatArea />
        </Box>

        {/* 能力环 — 对话区下方快捷入口 */}
        <Box pointerEvents="auto">
          <CapabilityRing />
        </Box>

        {/* 状态提示条 — 收起时显示向上箭头 */}
        {!chatExpanded && (
          <Box
            pointerEvents="auto"
            display="flex"
            justifyContent="center"
            py="6px"
            cursor="pointer"
            onClick={toggleChat}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139, 92, 246, 0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </Box>
        )}

        {/* 输入栏 — 始终底部显示 */}
        <Box
          flexShrink={0}
          pointerEvents="auto"
          bg="rgba(10, 0, 21, 0.75)"
          backdropFilter="blur(16px)"
          borderTop="1px solid rgba(139, 92, 246, 0.1)"
        >
          <InputBar />
        </Box>

        {/* 好感度状态条 — 最底部 */}
        <Box flexShrink={0} pointerEvents="auto">
          <AffinityBar />
        </Box>
      </Box>
    </Box>
  );
}

function App(): JSX.Element {
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem('lain-visited');
  });

  if (showLanding) {
    return (
      <LandingAnimation onComplete={() => {
        setShowLanding(false);
        sessionStorage.setItem('lain-visited', 'true');
      }} />
    );
  }

  return (
    <ErrorBoundary>
      <ChakraProvider value={defaultSystem}>
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
                                        <Toaster />
                                        <MainContent />
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
      </ChakraProvider>
    </ErrorBoundary>
  );
}

export default App;
