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

const GATEWAY_TOKEN = 'ed7c72944103e6fecc89140cb5e9661d04dc6699a09bdf05';
const GATEWAY_SESSION_KEY = 'ling-avatar-session';

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

const LING_MODEL_INFO: ModelInfo = {
  name: '灵 (Ling)',
  url: 'https://classic.sngxai.com/live2d-models/ling_pro_zh/ling_pro_zh.model3.json',
  kScale: 0.65,
  initialXshift: 0,
  initialYshift: -100,
  idleMotionGroupName: 'Idle',
  emotionMap: {},
};

// ─── Default backgrounds (no longer fetched from backend) ────────

const DEFAULT_BACKGROUNDS = [
  { name: 'ceiling-window-room-night.jpeg', url: 'https://classic.sngxai.com/bg/ceiling-window-room-night.jpeg' },
];

// ─── Default config files (no longer fetched from backend) ───────

const DEFAULT_CONFIG_FILES = [
  { filename: 'ling_pro_zh.yaml', name: '灵 (Ling)' },
];

// ─── Component ──────────────────────────────────────────────────

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<string>('CLOSED');
  const [gwUrl, setGwUrl] = useLocalStorage<string>('wsUrl', getDefaultGatewayUrl());
  const [baseUrl, setBaseUrl] = useLocalStorage<string>('baseUrl', defaultBaseUrl);
  const { aiState, setAiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const { setSubtitleText } = useSubtitle();
  const { clearResponse, setForceNewMessage, appendHumanMessage, appendOrUpdateToolCallMessage } = useChatHistory();
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
        console.log('Starting microphone...');
        startMic();
        break;
      case 'stop-mic':
        console.log('Stopping microphone...');
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
    switch (message.type) {
      case 'control':
        if (message.text) {
          handleControlMessage(message.text);
        }
        break;
      case 'full-text':
        if (message.text) {
          setSubtitleText(message.text);
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
  }, [aiState, addAudioTask, appendHumanMessage, baseUrl, bgUrlContext, setAiState, setConfName, setConfUid, setConfigFiles, setCurrentHistoryUid, setHistoryList, setMessages, setModelInfo, setSubtitleText, startMic, stopMic, setSelfUid, setGroupMembers, setIsOwner, backendSynthComplete, setBackendSynthComplete, clearResponse, handleControlMessage, appendOrUpdateToolCallMessage, interrupt, setBrowserViewData, t, affinityContext]);

  // ─── Connect to Gateway on mount / URL change ─────────────────

  useEffect(() => {
    // Connect to Gateway
    gatewayConnector.connect({
      url: gwUrl,
      token: GATEWAY_TOKEN,
      clientId: 'ling-avatar',
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

      // Create a default session
      setCurrentHistoryUid(GATEWAY_SESSION_KEY);
      setMessages([]);
      setHistoryList([{
        uid: GATEWAY_SESSION_KEY,
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

  // ─── Subscribe to Gateway events ───────────────────────────────

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
    const messageSub = gatewayAdapter.message$.subscribe(handleWebSocketMessage);

    return () => {
      stateSub.unsubscribe();
      agentSub.unsubscribe();
      rawSub.unsubscribe();
      messageSub.unsubscribe();
    };
  }, [handleWebSocketMessage]);

  // ─── TTS: synthesize speech when full-text arrives ─────────────

  const lastTtsTextRef = useRef('');

  useEffect(() => {
    const sub = gatewayAdapter.message$.subscribe((msg) => {
      if (msg.type !== 'full-text' || !msg.text) return;

      const fullText = msg.text;
      const prevText = lastTtsTextRef.current;

      // Find newly completed sentences
      const newText = fullText.slice(prevText.length);
      if (!newText) return;

      // Check if new text contains a sentence terminator
      const sentences = ttsService.extractCompleteSentences(prevText, fullText);
      for (const sentence of sentences) {
        if (sentence.trim().length < 2) continue;
        console.log('[TTS] Synthesizing sentence:', sentence);

        ttsService.synthesize(sentence).then((result) => {
          if (result) {
            addAudioTask({
              audioBase64: result.audioBase64,
              volumes: result.volumes,
              sliceLength: result.sliceLength,
              displayText: { text: sentence, name: '灵', avatar: '' },
              expressions: null,
              forwarded: false,
            });
          }
        }).catch((err) => {
          console.error('[TTS] Synthesis failed:', err);
        });
      }

      lastTtsTextRef.current = fullText;
    });

    return () => sub.unsubscribe();
  }, [addAudioTask]);

  // Reset TTS text tracking on conversation chain start
  useEffect(() => {
    const sub = gatewayAdapter.message$.subscribe((msg) => {
      if (msg.type === 'control' && msg.text === 'conversation-chain-start') {
        lastTtsTextRef.current = '';
      }
    });
    return () => sub.unsubscribe();
  }, []);

  // ─── sendMessage: intercept ALL legacy message types ──────────

  const sendMessage = useCallback((message: object) => {
    const msg = message as any;

    switch (msg.type) {
      // ── Phase 2: Text input → Gateway chat.send ──
      case 'text-input':
        if (msg.text) {
          gatewayConnector.sendChat(GATEWAY_SESSION_KEY, msg.text).catch((err) => {
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
          gatewayConnector.sendChat(GATEWAY_SESSION_KEY, transcript.trim()).catch((err) => {
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
          GATEWAY_SESSION_KEY,
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
        const newSessionKey = `ling-session-${Date.now()}`;
        gatewayConnector.resolveSession(newSessionKey, 'ling').then(() => {
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
        clientId: 'ling-avatar',
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
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
