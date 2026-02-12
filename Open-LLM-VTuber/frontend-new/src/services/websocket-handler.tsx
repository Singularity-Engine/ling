/* eslint-disable no-sparse-arrays */
/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line object-curly-newline
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageEvent } from '@/services/websocket-service';
import {
  WebSocketContext, HistoryInfo, defaultBaseUrl,
} from '@/context/websocket-context';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useSubtitle } from '@/context/subtitle-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAudioTask } from '@/components/canvas/live2d';
import { useBgUrl } from '@/context/bgurl-context';
import { useConfig } from '@/context/character-config-context';
import { useChatHistory } from '@/context/chat-history-context';
import { toaster } from '@/components/ui/toaster';
import { useVAD } from '@/context/vad-context';
import { AiState, useAiState } from "@/context/ai-state-context";
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useGroup } from '@/context/group-context';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useBrowser } from '@/context/browser-context';
import { useAffinity } from '@/context/affinity-context';
import { useToolState, categorize } from '@/context/tool-state-context';
import { gatewayConnector, GatewayState } from '@/services/gateway-connector';
import { gatewayAdapter } from '@/services/gateway-message-adapter';
import { ttsService } from '@/services/tts-service';
import { asrService } from '@/services/asr-service';

// ─── Gateway configuration ──────────────────────────────────────

const GATEWAY_TOKEN = import.meta.env.VITE_GATEWAY_TOKEN || '';

/** Per-visitor session key — each browser gets its own isolated session */
/** Public site uses restricted agent; local dev uses full agent */
function getAgentId(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'avatar';
  }
  return 'avatar-public';
}

/** Per-visitor session key in Gateway's agent-scoped format: agent:<agentId>:<uuid> */
function getVisitorSessionKey(): string {
  const agentId = getAgentId();
  const STORAGE_KEY = `ling-sk-${agentId}`;
  // Purge old key formats that didn't use agent: prefix
  localStorage.removeItem('ling-visitor-session-key');
  localStorage.removeItem(`ling-session-${agentId}`);
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key || !key.startsWith('agent:')) {
    key = `agent:${agentId}:${crypto.randomUUID()}`;
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

function getDefaultGatewayUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://127.0.0.1:18789';
  }
  return 'wss://ws.sngxai.com';
}

/** Map Gateway state to the legacy WS state strings the rest of the app expects */
function mapGatewayState(state: GatewayState): string {
  switch (state) {
    case 'CONNECTED': return 'OPEN';
    case 'CONNECTING':
    case 'HANDSHAKING': return 'CONNECTING';
    case 'RECONNECTING': return 'CONNECTING';
    case 'DISCONNECTED': return 'CLOSED';
    default: return 'CLOSED';
  }
}

// ─── Default model info for 灵 (Ling) — no longer fetched from backend ─

const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

const LING_MODEL_INFO: ModelInfo = {
  name: '灵 (Ling)',
  url: 'https://lain.sngxai.com/live2d-models/001/0A-原档整理(1).model3.json',
  kScale: 1.0,
  initialXshift: 0,
  initialYshift: isMobile ? 0 : -100,
  idleMotionGroupName: 'Idle',
  emotionMap: {
    // English emotion keywords → Live2D expression names
    happy: 'kaixin',
    sad: 'shangxin',
    shy: 'haixiu',
    angry: 'heilian',
    thinking: 'tuosai',
    confident: 'chayao',
    sleepy: 'shuijiao',
    // Chinese emotion keywords
    开心: 'kaixin',
    伤心: 'shangxin',
    害羞: 'haixiu',
    生气: 'heilian',
    思考: 'tuosai',
    自信: 'chayao',
    困: 'shuijiao',
    // Default expression (index 0)
    neutral: 0,
  },
};

// ─── Default backgrounds (no longer fetched from backend) ────────

const DEFAULT_BACKGROUNDS = [
  { name: 'ceiling-window-room-night.jpeg', url: 'https://classic.sngxai.com/bg/ceiling-window-room-night.jpeg' },
];

// ─── Default config files (no longer fetched from backend) ───────

const DEFAULT_CONFIG_FILES = [
  { filename: 'ling_pro_zh.yaml', name: '灵 (Ling)' },
];

// ─── Debug overlay ──────────────────────────────────────────────

function GatewayDebugPanel() {
  const [info, setInfo] = useState({ rawFrames: 0, agentEvents: 0, ticks: 0, lastEvent: '', messageCount: 0, state: 'CLOSED' });
  useEffect(() => {
    const msgCounter = { count: 0 };
    const msgSub = gatewayAdapter.message$.subscribe((msg) => {
      msgCounter.count++;
      if (import.meta.env.DEV) console.log('[DebugPanel] message$ event:', msg.type, msg);
    });
    const timer = setInterval(() => {
      const c = gatewayConnector.debugCounters;
      setInfo({ rawFrames: c.rawFrames, agentEvents: c.agentEvents, ticks: c.ticks, lastEvent: c.lastEvent, messageCount: msgCounter.count, state: gatewayConnector.getState() });
    }, 500);
    return () => { clearInterval(timer); msgSub.unsubscribe(); };
  }, []);
  return (
    <div style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 99999, background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', pointerEvents: 'none', lineHeight: 1.5 }}>
      <div>GW: {info.state} | Frames: {info.rawFrames} | Ticks: {info.ticks}</div>
      <div>Agent: {info.agentEvents} | Msg$: {info.messageCount}</div>
      <div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Last: {info.lastEvent || 'none'}</div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<string>('CLOSED');
  const [gwUrl, setGwUrl] = useLocalStorage<string>('gwUrl', getDefaultGatewayUrl());
  const [baseUrl, setBaseUrl] = useLocalStorage<string>('baseUrl', defaultBaseUrl);
  const { aiState, setAiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const { setSubtitleText } = useSubtitle();
  const { clearResponse, setForceNewMessage, appendHumanMessage, appendAIMessage, appendOrUpdateToolCallMessage, setFullResponse } = useChatHistory();
  const { addAudioTask } = useAudioTask();
  const bgUrlContext = useBgUrl();
  const { confUid, setConfName, setConfUid, setConfigFiles } = useConfig();
  const [pendingModelInfo, setPendingModelInfo] = useState<ModelInfo | undefined>(undefined);
  const { setSelfUid, setGroupMembers, setIsOwner } = useGroup();
  const { micOn, startMic, stopMic, autoStartMicOnConvEnd } = useVAD();
  const autoStartMicOnConvEndRef = useRef(autoStartMicOnConvEnd);
  const { interrupt } = useInterrupt();
  const { setBrowserViewData } = useBrowser();
  const affinityContext = useAffinity();
  const { startTool, updateTool, completeTool, failTool } = useToolState();

  useEffect(() => {
    autoStartMicOnConvEndRef.current = autoStartMicOnConvEnd;
  }, [autoStartMicOnConvEnd]);

  useEffect(() => {
    if (pendingModelInfo && confUid) {
      setModelInfo(pendingModelInfo);
      setPendingModelInfo(undefined);
    }
  }, [pendingModelInfo, setModelInfo, confUid]);

  const {
    setCurrentHistoryUid, setMessages, setHistoryList,
  } = useChatHistory();

  // ─── Refs for sendMessage access (avoids closure dependency) ──

  const appendHumanMessageRef = useRef(appendHumanMessage);
  useEffect(() => { appendHumanMessageRef.current = appendHumanMessage; }, [appendHumanMessage]);

  const setMessagesRef = useRef(setMessages);
  useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages]);

  const setHistoryListRef = useRef(setHistoryList);
  useEffect(() => { setHistoryListRef.current = setHistoryList; }, [setHistoryList]);

  const setCurrentHistoryUidRef = useRef(setCurrentHistoryUid);
  useEffect(() => { setCurrentHistoryUidRef.current = setCurrentHistoryUid; }, [setCurrentHistoryUid]);

  const setAiStateRef = useRef(setAiState);
  useEffect(() => { setAiStateRef.current = setAiState; }, [setAiState]);

  const setSubtitleTextRef = useRef(setSubtitleText);
  useEffect(() => { setSubtitleTextRef.current = setSubtitleText; }, [setSubtitleText]);

  // Per-visitor session key (stable across renders)
  const sessionKeyRef = useRef(getVisitorSessionKey());

  // ─── ASR lifecycle: start/stop with microphone ─────────────────

  useEffect(() => {
    if (micOn) {
      asrService.start();
    } else {
      // Don't harvest result on mic toggle — only harvest on mic-audio-end
      if (asrService.listening) {
        asrService.stop();
      }
    }
  }, [micOn]);

  // ─── Control messages ──────────────────────────────────────────

  const handleControlMessage = useCallback((controlText: string) => {
    switch (controlText) {
      case 'start-mic':
        if (import.meta.env.DEV) console.log('Starting microphone...');
        startMic();
        break;
      case 'stop-mic':
        if (import.meta.env.DEV) console.log('Stopping microphone...');
        stopMic();
        break;
      case 'conversation-chain-start':
        setAiState('thinking-speaking');
        audioTaskQueue.clearQueue();
        clearResponse();
        break;
      case 'conversation-chain-end':
        audioTaskQueue.addTask(() => new Promise<void>((resolve) => {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              if (autoStartMicOnConvEndRef.current) {
                startMic();
              }
              return 'idle';
            }
            return currentState;
          });
          resolve();
        }));
        break;
      default:
        console.warn('Unknown control command:', controlText);
    }
  }, [setAiState, clearResponse, setForceNewMessage, startMic, stopMic]);

  // ─── Message handler (receives adapted Gateway messages) ──────

  const handleWebSocketMessage = useCallback((message: MessageEvent) => {
    if (import.meta.env.DEV) console.log('[WS-Handler] Processing message:', message.type, message);
    switch (message.type) {
      case 'control':
        if (message.text) {
          if (import.meta.env.DEV) console.log('[WS-Handler] control:', message.text);
          handleControlMessage(message.text);
        }
        break;
      case 'full-text':
        if (message.text) {
          if (import.meta.env.DEV) console.log('[WS-Handler] full-text:', message.text.slice(0, 50));
          setSubtitleText(message.text);
          setFullResponse(message.text);
        }
        break;
      case 'ai-message-complete':
        // Finalize the streamed text as a permanent chat message
        if (message.text) {
          console.log('[WS-Handler] ai-message-complete:', message.text.slice(0, 50));
          appendAIMessage(message.text);
          clearResponse();
        }
        break;
      case 'error':
        toaster.create({
          title: message.message,
          type: 'error',
          duration: 2000,
        });
        break;
      case 'backend-synth-complete':
        setBackendSynthComplete(true);
        break;
      case 'conversation-chain-end':
        if (!audioTaskQueue.hasTask()) {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              return 'idle';
            }
            return currentState;
          });
        }
        break;
      case 'force-new-message':
        setForceNewMessage(true);
        break;
      case 'interrupt-signal':
        interrupt(false);
        break;

      // ── Phase 4: Tool call visualization ──
      case 'tool_call_status':
        if (message.tool_id && message.tool_name && message.status) {
          if (message.browser_view) {
            setBrowserViewData(message.browser_view);
          }
          appendOrUpdateToolCallMessage({
            id: message.tool_id,
            type: 'tool_call_status',
            role: 'ai',
            tool_id: message.tool_id,
            tool_name: message.tool_name,
            name: message.name,
            status: message.status as ('running' | 'completed' | 'error'),
            content: message.content || '',
            timestamp: message.timestamp || new Date().toISOString(),
          });
          const toolStatus = message.status as string;
          if (toolStatus === 'running') {
            startTool({
              id: message.tool_id,
              name: message.tool_name,
              category: categorize(message.tool_name),
              arguments: message.content || '',
            });
          } else if (toolStatus === 'completed') {
            completeTool(message.tool_id, message.content || '');
          } else if (toolStatus === 'error') {
            failTool(message.tool_id, message.content || 'Unknown error');
          }
        }
        break;

      // ── Phase 7: Affinity & emotion ──
      case 'affinity-update':
        if (affinityContext) {
          affinityContext.updateAffinity(message.affinity, message.level);
        }
        break;
      case 'affinity-milestone':
        if (affinityContext) {
          affinityContext.showMilestone(message.message || `好感度达到 ${message.milestone}！`);
        }
        break;
      case 'emotion-expression':
        if (affinityContext) {
          affinityContext.setExpression(message.expression, message.intensity || 0.5);
        }
        break;

      // ── Legacy message types (no longer received from Gateway) ──
      // Kept as fallback — these are dead code in Gateway mode but
      // won't cause errors if somehow triggered.
      case 'set-model-and-conf':
      case 'config-files':
      case 'background-files':
      case 'audio':
      case 'history-data':
      case 'new-history-created':
      case 'history-deleted':
      case 'history-list':
      case 'user-input-transcription':
      case 'group-update':
      case 'group-operation-result':
        // No-op in Gateway mode
        break;

      default:
        // Suppress noisy warnings for known-unhandled types
        break;
    }
  }, [aiState, appendHumanMessage, appendAIMessage, baseUrl, bgUrlContext, setAiState, setConfName, setConfUid, setConfigFiles, setCurrentHistoryUid, setHistoryList, setMessages, setModelInfo, setSubtitleText, setFullResponse, startMic, stopMic, setSelfUid, setGroupMembers, setIsOwner, backendSynthComplete, setBackendSynthComplete, clearResponse, handleControlMessage, appendOrUpdateToolCallMessage, interrupt, setBrowserViewData, t, affinityContext]);

  // ─── Connect to Gateway on mount / URL change ─────────────────

  useEffect(() => {
    // Connect to Gateway
    gatewayConnector.connect({
      url: gwUrl,
      token: GATEWAY_TOKEN,
      clientId: 'webchat-ui',
      displayName: '灵 Avatar',
    }).then(() => {
      console.log('[WebSocketHandler] Gateway connected!');

      // Initialize: set model info directly (no backend fetch needed)
      setConfName('灵 (Ling)');
      setConfUid('ling-default');
      setSelfUid(crypto.randomUUID());
      setPendingModelInfo(LING_MODEL_INFO);
      setAiState('idle');

      // Phase 6: Pre-populate config files and backgrounds locally
      setConfigFiles(DEFAULT_CONFIG_FILES);
      bgUrlContext?.setBackgroundFiles(DEFAULT_BACKGROUNDS);

      // Resolve the default session so Gateway knows which agent to route to
      gatewayConnector.resolveSession(sessionKeyRef.current, getAgentId()).catch((err) => {
        console.error('[WebSocketHandler] resolveSession failed:', err);
      });

      // Create a default session
      setCurrentHistoryUid(sessionKeyRef.current);
      setMessages([]);
      setHistoryList([{
        uid: sessionKeyRef.current,
        latest_message: null,
        timestamp: new Date().toISOString(),
      }]);
    }).catch((err) => {
      console.error('[WebSocketHandler] Gateway connection failed:', err);
      toaster.create({
        title: `Gateway 连接失败: ${err.message}`,
        type: 'error',
        duration: 5000,
      });
    });

    return () => {
      gatewayConnector.disconnect();
    };
  }, [gwUrl]);

  // ─── Subscribe to Gateway events (stable — never tears down) ───

  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => { handleWebSocketMessageRef.current = handleWebSocketMessage; }, [handleWebSocketMessage]);

  useEffect(() => {
    // Subscribe to Gateway state changes
    const stateSub = gatewayConnector.state$.subscribe((state) => {
      setWsState(mapGatewayState(state));
    });

    // Subscribe to agent events (via adapter → MessageEvent format)
    const agentSub = gatewayConnector.agentEvent$.subscribe((event) => {
      gatewayAdapter.handleAgentEvent(event);
    });

    // Subscribe to raw frames (for affinity, emotion, etc.)
    const rawSub = gatewayConnector.rawFrame$.subscribe((frame) => {
      gatewayAdapter.handleRawFrame(frame);
    });

    // Subscribe to adapted messages → feed into existing message handler
    // Uses ref to always call the latest handler without tearing down subscriptions
    const messageSub = gatewayAdapter.message$.subscribe((msg) => {
      handleWebSocketMessageRef.current(msg);
    });

    return () => {
      stateSub.unsubscribe();
      agentSub.unsubscribe();
      rawSub.unsubscribe();
      messageSub.unsubscribe();
    };
  }, []); // Empty deps: subscribe once, never tear down

  // ─── TTS: synthesize speech when full-text arrives ─────────────

  const lastTtsTextRef = useRef('');
  const addAudioTaskRef = useRef(addAudioTask);
  useEffect(() => { addAudioTaskRef.current = addAudioTask; }, [addAudioTask]);

  // Synthesis queue: serialize synthesis calls to preserve sentence order
  const synthQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Track synthesized sentences to prevent duplicates
  const synthesizedRef = useRef(new Set<string>());
  // Track current expression for TTS audio tasks
  const currentExpressionRef = useRef<string | null>(null);
  useEffect(() => { currentExpressionRef.current = affinityContext.currentExpression; }, [affinityContext.currentExpression]);

  useEffect(() => {
    const sub = gatewayAdapter.message$.subscribe((msg) => {
      if (msg.type === 'full-text' && msg.text) {
        const fullText = msg.text;
        const prevText = lastTtsTextRef.current;

        const newText = fullText.slice(prevText.length);
        if (!newText) return;

        const sentences = ttsService.extractCompleteSentences(prevText, fullText);
        for (const sentence of sentences) {
          if (sentence.trim().length < 2) continue;
          // Dedup: skip if already synthesized in this conversation
          if (synthesizedRef.current.has(sentence)) {
            console.log('[TTS] Skipping duplicate:', sentence);
            continue;
          }
          synthesizedRef.current.add(sentence);

          // Chain synthesis sequentially to preserve order
          synthQueueRef.current = synthQueueRef.current.then(async () => {
            console.log('[TTS] Synthesizing:', sentence);
            try {
              const result = await ttsService.synthesize(sentence);
              if (result) {
                const expr = currentExpressionRef.current;
                addAudioTaskRef.current({
                  audioBase64: result.audioBase64,
                  volumes: result.volumes,
                  sliceLength: result.sliceLength,
                  displayText: { text: sentence, name: '灵', avatar: '' },
                  expressions: expr ? [{ expression: expr, intensity: 1.0 }] : null,
                  forwarded: false,
                });
              }
            } catch (err) {
              console.error('[TTS] Synthesis failed:', err);
            }
          });
        }

        lastTtsTextRef.current = fullText;
      }

      // Reset TTS text tracking on conversation chain start
      if (msg.type === 'control' && msg.text === 'conversation-chain-start') {
        lastTtsTextRef.current = '';
        synthesizedRef.current.clear();
      }
    });

    return () => sub.unsubscribe();
  }, []); // Stable: never tears down

  // ─── sendMessage: intercept ALL legacy message types ──────────

  const sendMessage = useCallback((message: object) => {
    const msg = message as any;

    switch (msg.type) {
      // ── Phase 2: Text input → Gateway chat.send ──
      case 'text-input':
        if (msg.text) {
          gatewayConnector.sendChat(sessionKeyRef.current, msg.text).catch((err) => {
            console.error('[Gateway] sendChat failed:', err);
          });
        }
        return;

      // ── Phase 5: Interrupt → Gateway abort ──
      case 'interrupt-signal': {
        const runId = gatewayAdapter.getActiveRunId();
        if (runId) {
          gatewayConnector.abortRun(runId).catch((err) => {
            console.error('[Gateway] abortRun failed:', err);
          });
        }
        return;
      }

      // ── Phase 5: Voice input — ASR handled separately ──
      case 'mic-audio-data':
        // Drop: raw audio not sent to Gateway; ASR runs alongside VAD
        return;

      case 'mic-audio-end': {
        // Harvest ASR transcript and send as text
        const transcript = asrService.stop();
        if (transcript.trim()) {
          appendHumanMessageRef.current(transcript.trim());
          gatewayConnector.sendChat(sessionKeyRef.current, transcript.trim()).catch((err) => {
            console.error('[Gateway] sendChat (ASR) failed:', err);
          });
        } else {
          console.warn('[ASR] No transcript available from speech recognition');
        }
        // Restart ASR if mic is still on (will be re-started by micOn effect)
        return;
      }

      // ── Phase 5: Proactive speak → Gateway chat.send ──
      case 'ai-speak-signal':
        gatewayConnector.sendChat(
          sessionKeyRef.current,
          '[proactive-speak]',
        ).catch((err) => {
          console.error('[Gateway] proactive speak failed:', err);
        });
        return;

      // ── Phase 6: Session management ──
      case 'fetch-and-set-history':
        if (msg.history_uid) {
          setCurrentHistoryUidRef.current(msg.history_uid);
          gatewayConnector.getChatHistory(msg.history_uid).then((res) => {
            const payload = res.payload as any;
            if (payload?.messages) {
              setMessagesRef.current(payload.messages);
            } else {
              // Gateway may return empty or different format
              setMessagesRef.current([]);
            }
            toaster.create({
              title: '会话已加载',
              type: 'success',
              duration: 2000,
            });
          }).catch((err) => {
            console.error('[Gateway] getChatHistory failed:', err);
            toaster.create({
              title: `加载会话失败: ${err.message}`,
              type: 'error',
              duration: 2000,
            });
          });
        }
        return;

      case 'create-new-history': {
        const newSessionKey = `agent:${getAgentId()}:${crypto.randomUUID()}`;
        gatewayConnector.resolveSession(newSessionKey, getAgentId()).then(() => {
          setCurrentHistoryUidRef.current(newSessionKey);
          setMessagesRef.current([]);
          const newHistory: HistoryInfo = {
            uid: newSessionKey,
            latest_message: null,
            timestamp: new Date().toISOString(),
          };
          setHistoryListRef.current((prev: HistoryInfo[]) => [newHistory, ...prev]);
          setAiStateRef.current('idle');
          setSubtitleTextRef.current('新对话已创建');
          toaster.create({
            title: '新对话已创建',
            type: 'success',
            duration: 2000,
          });
        }).catch((err) => {
          console.error('[Gateway] resolveSession failed:', err);
        });
        return;
      }

      case 'fetch-history-list':
        gatewayConnector.listSessions().then((res) => {
          const payload = res.payload as any;
          if (payload?.sessions) {
            const historyList: HistoryInfo[] = payload.sessions.map((s: any) => ({
              uid: s.key || s.id,
              latest_message: s.lastMessage || null,
              timestamp: s.updatedAt || s.createdAt || new Date().toISOString(),
            }));
            setHistoryListRef.current(historyList);
          }
        }).catch((err) => {
          console.error('[Gateway] listSessions failed:', err);
        });
        return;

      case 'delete-history':
        if (msg.history_uid) {
          // Remove from local list (Gateway may not support delete)
          setHistoryListRef.current((prev: HistoryInfo[]) =>
            prev.filter((h: HistoryInfo) => h.uid !== msg.history_uid)
          );
          toaster.create({
            title: '会话已删除',
            type: 'success',
            duration: 2000,
          });
        }
        return;

      // ── Phase 6: Config/background — handled locally ──
      case 'switch-config':
        // In Gateway mode, character switching is handled locally
        // The model info is set directly without backend involvement
        console.log('[Gateway] switch-config intercepted, handled locally');
        return;

      case 'fetch-configs':
      case 'fetch-backgrounds':
        // Already populated on connect — no-op
        return;

      // ── Phase 3: Audio notifications — not needed for Gateway ──
      case 'audio-play-start':
      case 'frontend-playback-complete':
        // Gateway doesn't need audio playback notifications
        return;

      // ── Phase 7: Group operations — not supported by Gateway ──
      case 'request-group-info':
      case 'add-client-to-group':
      case 'remove-client-from-group':
        // Gateway doesn't support group functionality
        return;

      default:
        // Unknown message type — log for debugging
        console.log('[Gateway] Unhandled sendMessage type:', msg.type);
        return;
    }
  }, []);

  const webSocketContextValue = useMemo(() => ({
    sendMessage,
    wsState,
    reconnect: () => {
      gatewayConnector.disconnect();
      gatewayConnector.connect({
        url: gwUrl,
        token: GATEWAY_TOKEN,
        clientId: 'webchat-ui',
        displayName: '灵 Avatar',
      }).catch(console.error);
    },
    wsUrl: gwUrl,
    setWsUrl: setGwUrl,
    baseUrl,
    setBaseUrl,
  }), [sendMessage, wsState, gwUrl, baseUrl]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      {import.meta.env.DEV && <GatewayDebugPanel />}
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
