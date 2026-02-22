/* eslint-disable no-sparse-arrays */
/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line object-curly-newline
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageEvent } from '@/services/websocket-service';
import {
  WebSocketContext, HistoryInfo, LegacyMessage, defaultBaseUrl,
} from '@/context/websocket-context';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useSubtitle } from '@/context/subtitle-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAudioTask } from '@/components/canvas/live2d';
import { useBgUrl } from '@/context/bgurl-context';
import { useConfig } from '@/context/character-config-context';
import { useChatMessages, useStreamingSetters } from '@/context/chat-history-context';
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
import { gatewayAdapter, GatewayMessageEvent } from '@/services/gateway-message-adapter';
import { ttsService } from '@/services/tts-service';
import { asrService } from '@/services/asr-service';
import { useTTSState } from '@/context/tts-state-context';
import { BRAND_NAME_SHORT, BRAND_NAME_DISPLAY, BRAND_AVATAR_NAME } from '@/constants/brand';
import { useAuth } from '@/context/auth-context';
import { useUI, type BillingModalState } from '@/context/ui-context';
import { apiClient } from '@/services/api-client';
import i18next from 'i18next';

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

const modelBaseUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/live2d-models/001`
  : '/live2d-models/001';

const LING_MODEL_INFO: ModelInfo = {
  name: BRAND_NAME_DISPLAY,
  url: `${modelBaseUrl}/0A-原档整理(1).model3.json`,
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
  { filename: 'ling_pro_zh.yaml', name: BRAND_NAME_DISPLAY },
];

// ─── Greeting expression helper ─────────────────────────────────

/** Set a welcoming expression (kaixin/happy) on the Live2D model during greeting.
 *  Delayed to ensure the model is loaded — longer delay for initial page load. */
function setGreetingExpression(delayMs = 200) {
  setTimeout(() => {
    const lappAdapter = window.getLAppAdapter?.();
    if (lappAdapter) {
      try { lappAdapter.setExpression('kaixin'); } catch { /* model may not be ready */ }
    }
  }, delayMs);
}

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
  const { appendHumanMessage, appendAIMessage, appendOrUpdateToolCallMessage } = useChatMessages();
  const { clearResponse, setForceNewMessage, setFullResponse } = useStreamingSetters();
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
  const { startTool, completeTool, failTool } = useToolState();
  const { markSynthStart, markSynthDone, markSynthError, markPlayStart, markPlayDone, reset: resetTTSState } = useTTSState();
  const { updateCredits, user } = useAuth();
  const { setBillingModal } = useUI();

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
  } = useChatMessages();

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

  const clearResponseRef = useRef(clearResponse);
  useEffect(() => { clearResponseRef.current = clearResponse; }, [clearResponse]);

  // Per-visitor session key (stable across renders)
  const sessionKeyRef = useRef(getVisitorSessionKey());

  // ─── Billing check ──────────────────────────────────────────
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const billingInFlightRef = useRef(false);
  const updateCreditsRef = useRef(updateCredits);
  useEffect(() => { updateCreditsRef.current = updateCredits; }, [updateCredits]);
  const setBillingModalRef = useRef(setBillingModal);
  useEffect(() => { setBillingModalRef.current = setBillingModal; }, [setBillingModal]);

  const checkBilling = useCallback(async (): Promise<boolean> => {
    const token = apiClient.getToken();
    if (!token) return true; // guest → allow, backend handles it

    if (billingInFlightRef.current) return true;
    billingInFlightRef.current = true;
    try {
      const data = await apiClient.checkAndDeduct();
      if (data.credits_balance !== undefined) {
        updateCreditsRef.current(data.credits_balance);
      }
      if (!data.allowed) {
        setBillingModalRef.current({
          open: true,
          reason: data.reason as BillingModalState['reason'],
          message: data.message,
        });
        return false;
      }
      return true;
    } catch (err) {
      // Network error → allow (don't block user)
      return true;
    } finally {
      billingInFlightRef.current = false;
    }
  }, []);

  // Guest message counter — tracks how many messages a guest has sent
  const guestMessageCountRef = useRef(0);
  const GUEST_MESSAGE_LIMIT = 5;

  // Guard: only send auto-greeting once per page load
  const greetingSentRef = useRef(false);

  // TTS generation counter — incremented on new conversation to discard stale synthesis results
  const ttsGenerationRef = useRef(0);

  // Pending new chat flag — prevents stale conversation-chain-end from flickering to idle
  const pendingNewChatRef = useRef(false);

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
        pendingNewChatRef.current = false;
        setAiState('thinking-speaking');
        audioTaskQueue.clearQueue();
        clearResponse();
        break;
      case 'conversation-chain-end':
        // Skip idle transition if a new message was just sent (prevents flicker)
        if (pendingNewChatRef.current) {
          if (import.meta.env.DEV) console.log('[WS-Handler] Skipping idle transition — pending new chat');
          break;
        }
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
        if (import.meta.env.DEV) console.warn('Unknown control command:', controlText);
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
          if (import.meta.env.DEV) console.log('[WS-Handler] ai-message-complete:', message.text.slice(0, 50));
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
            // Emit constellation skill event
            window.dispatchEvent(new CustomEvent('constellation-skill-used', {
              detail: { toolName: message.tool_name },
            }));
            startTool({
              id: message.tool_id,
              name: message.tool_name,
              category: categorize(message.tool_name),
              arguments: message.content || '',
              status: 'running',
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
          const aMsg = message as GatewayMessageEvent;
          affinityContext.updateAffinity(aMsg.affinity, aMsg.level);
        }
        break;
      case 'affinity-milestone':
        if (affinityContext) {
          const mMsg = message as GatewayMessageEvent;
          affinityContext.showMilestone(message.content || i18next.t('notification.affinityReached', { milestone: mMsg.milestone }));
          // Upgrade prompt for free users at 'friendly' milestone
          if (mMsg.level === 'friendly' || mMsg.milestone === 'friendly') {
            const currentUser = userRef.current;
            if (currentUser && currentUser.plan === 'free') {
              setTimeout(() => {
                setBillingModalRef.current({
                  open: true,
                  reason: 'affinity_milestone',
                  message: i18next.t('billing.affinityUpgradeMessage'),
                });
              }, 3000);
            }
          }
        }
        break;
      case 'emotion-expression':
        if (affinityContext) {
          const eMsg = message as GatewayMessageEvent;
          affinityContext.setExpression(eMsg.expression, eMsg.intensity || 0.5);
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
      displayName: BRAND_AVATAR_NAME,
    }).then(() => {
      if (import.meta.env.DEV) console.log('[WebSocketHandler] Gateway connected!');

      // Initialize: set model info directly (no backend fetch needed)
      setConfName(BRAND_NAME_DISPLAY);
      setConfUid('ling-default');
      setSelfUid(crypto.randomUUID());
      setPendingModelInfo(LING_MODEL_INFO);
      setAiState('idle');

      // Phase 6: Pre-populate config files and backgrounds locally
      setConfigFiles(DEFAULT_CONFIG_FILES);
      bgUrlContext?.setBackgroundFiles(DEFAULT_BACKGROUNDS);

      // Helper: send auto-greeting (used when no previous history exists)
      const sendGreetingIfNeeded = () => {
        if (!greetingSentRef.current) {
          const sendGreeting = () => {
            if (greetingSentRef.current) return;
            greetingSentRef.current = true;
            setAiState('thinking-speaking');
            const prefs = localStorage.getItem('ling-user-preferences');
            const greetingMsg = prefs ? `[greeting:context]${prefs}` : '[greeting]';
            gatewayConnector.sendChat(sessionKeyRef.current, greetingMsg).catch((err) => {
              if (import.meta.env.DEV) console.error('[WebSocketHandler] Auto-greeting failed:', err);
              setAiState('idle');
            });
          };

          if (sessionStorage.getItem('ling-visited')) {
            sendGreeting();
            setGreetingExpression(2000);
          } else {
            const onLandingComplete = () => {
              sendGreeting();
              setGreetingExpression(800);
              window.removeEventListener('ling-landing-complete', onLandingComplete);
            };
            window.addEventListener('ling-landing-complete', onLandingComplete);
          }
        }
      };

      // Try to resolve session and restore history; fall through to greeting on any failure
      gatewayConnector.resolveSession(sessionKeyRef.current, getAgentId())
        .then(() =>
          gatewayConnector.getChatHistory(sessionKeyRef.current)
            .then((res) => {
              const payload = res.payload;
              if (payload?.messages?.length && payload.messages.length > 0) {
                setMessagesRef.current(payload.messages);
                greetingSentRef.current = true;
                if (import.meta.env.DEV) console.log(`[WebSocketHandler] Restored ${payload.messages.length} messages from previous session`);
                return;
              }
              sendGreetingIfNeeded();
            })
            .catch(() => sendGreetingIfNeeded()),
        )
        .catch((err) => {
          // Session doesn't exist yet — chat.send will create it on first message
          if (import.meta.env.DEV) console.log('[WebSocketHandler] resolveSession failed (will create on first chat):', err.message);
          sendGreetingIfNeeded();
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
        title: i18next.t('notification.connectionFailed', { error: err.message }),
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
    // Subscribe to Gateway state changes — track transitions for user notifications
    let prevGwState: GatewayState | null = null;
    const stateSub = gatewayConnector.state$.subscribe((state) => {
      setWsState(mapGatewayState(state));

      // Issue 1: Notify user when connection drops and auto-reconnect starts
      if (state === 'RECONNECTING' && prevGwState === 'CONNECTED') {
        toaster.create({
          title: i18next.t('notification.connectionLost'),
          type: 'warning',
          duration: 4000,
        });
      }

      // Issue 2: Notify user when all reconnect attempts are exhausted
      if (state === 'DISCONNECTED' && prevGwState === 'RECONNECTING') {
        toaster.create({
          title: i18next.t('notification.reconnectFailed'),
          type: 'error',
          duration: 8000,
        });
      }

      prevGwState = state;
    });

    // Subscribe to agent events (via adapter → MessageEvent format)
    const agentSub = gatewayConnector.agentEvent$.subscribe((event) => {
      gatewayAdapter.handleAgentEvent(event);
    });

    // Subscribe to raw frames (for affinity, emotion, etc.)
    const rawSub = gatewayConnector.rawFrame$.subscribe((frame) => {
      gatewayAdapter.handleRawFrame(frame);
    });

    // ── Response timeout: detect when AI hangs mid-response ──
    // Track last activity timestamp; if >60s with no events while AI is thinking, warn user
    const RESPONSE_TIMEOUT_MS = 60_000;
    let lastActivity = 0;
    const responseCheckTimer = setInterval(() => {
      if (lastActivity > 0 && Date.now() - lastActivity > RESPONSE_TIMEOUT_MS) {
        lastActivity = 0; // Don't re-fire
        toaster.create({
          title: i18next.t('notification.responseTimeout'),
          type: 'warning',
          duration: 5000,
        });
        setAiStateRef.current('idle');
        setSubtitleTextRef.current('');
      }
    }, 10_000);

    // Subscribe to adapted messages → feed into existing message handler
    // Uses ref to always call the latest handler without tearing down subscriptions
    const messageSub = gatewayAdapter.message$.subscribe((msg) => {
      handleWebSocketMessageRef.current(msg);
      // Track activity for response timeout
      if (msg.type === 'control' && msg.text === 'conversation-chain-start') {
        lastActivity = Date.now();
      } else if (msg.type === 'full-text' || msg.type === 'tool_call_status') {
        if (lastActivity > 0) lastActivity = Date.now();
      } else if (
        (msg.type === 'control' && msg.text === 'conversation-chain-end') ||
        msg.type === 'ai-message-complete'
      ) {
        lastActivity = 0;
      }
    });

    // Network status: update offline$ and handle recovery
    const onOffline = () => {
      gatewayConnector.offline$.next(true);
      toaster.create({
        title: i18next.t('notification.networkOffline'),
        type: 'warning',
        duration: 4000,
      });
    };
    const onOnline = () => {
      gatewayConnector.offline$.next(false);
      gatewayConnector.retryNow();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // Post-reconnect recovery: reset stale state & re-resolve session
    const reconnectSub = gatewayConnector.reconnected$.subscribe(() => {
      // Clear stale adapter runs from interrupted generation
      gatewayAdapter.reset();
      // Reset AI state — may be stuck in 'thinking-speaking' if disconnect mid-run
      setAiStateRef.current('idle');
      // Clear any leftover subtitle from interrupted generation
      setSubtitleTextRef.current('');
      // Clear partial streaming response from interrupted generation
      clearResponseRef.current();
      // Clear stale audio tasks from interrupted TTS pipeline
      audioTaskQueue.clearQueue();
      // Reset pending-new-chat flag (may be stuck true if disconnect mid-send)
      pendingNewChatRef.current = false;
      // Reset TTS tracking so reconnected conversation starts clean
      lastTtsTextRef.current = '';
      synthesizedRef.current.clear();
      ttsErrorShownRef.current = false;
      resetTTSStateRef.current();
      // Reset response timeout tracker — prevents stale timeout firing after recovery
      lastActivity = 0;
      // Re-resolve session and restore chat history (captures responses completed during disconnect)
      gatewayConnector.resolveSession(sessionKeyRef.current, getAgentId())
        .then(() => gatewayConnector.getChatHistory(sessionKeyRef.current))
        .then((res) => {
          const payload = res.payload;
          if (payload?.messages?.length && payload.messages.length > 0) {
            setMessagesRef.current(payload.messages);
            if (import.meta.env.DEV) console.log(`[WebSocketHandler] Post-reconnect: restored ${payload.messages.length} messages`);
          }
        })
        .catch((err) => {
          console.error('[WebSocketHandler] Post-reconnect session recovery failed:', err);
        });
      // Notify user
      toaster.create({
        title: i18next.t('notification.connectionRestored'),
        type: 'success',
        duration: 3000,
      });
    });

    return () => {
      clearInterval(responseCheckTimer);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      stateSub.unsubscribe();
      agentSub.unsubscribe();
      rawSub.unsubscribe();
      messageSub.unsubscribe();
      reconnectSub.unsubscribe();
    };
  }, []); // Empty deps: subscribe once, never tear down

  // ─── TTS state refs (for stable useEffect access) ──────────────

  const markSynthStartRef = useRef(markSynthStart);
  useEffect(() => { markSynthStartRef.current = markSynthStart; }, [markSynthStart]);
  const markSynthDoneRef = useRef(markSynthDone);
  useEffect(() => { markSynthDoneRef.current = markSynthDone; }, [markSynthDone]);
  const markSynthErrorRef = useRef(markSynthError);
  useEffect(() => { markSynthErrorRef.current = markSynthError; }, [markSynthError]);
  const markPlayStartRef = useRef(markPlayStart);
  useEffect(() => { markPlayStartRef.current = markPlayStart; }, [markPlayStart]);
  const markPlayDoneRef = useRef(markPlayDone);
  useEffect(() => { markPlayDoneRef.current = markPlayDone; }, [markPlayDone]);
  const resetTTSStateRef = useRef(resetTTSState);
  useEffect(() => { resetTTSStateRef.current = resetTTSState; }, [resetTTSState]);

  // ─── TTS: synthesize speech when full-text arrives ─────────────

  const lastTtsTextRef = useRef('');
  const addAudioTaskRef = useRef(addAudioTask);
  useEffect(() => { addAudioTaskRef.current = addAudioTask; }, [addAudioTask]);

  // Synthesis queue: serialize synthesis calls to preserve sentence order
  const synthQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Track synthesized sentences to prevent duplicates
  const synthesizedRef = useRef(new Set<string>());
  // Only show TTS error toast once per conversation to avoid spam
  const ttsErrorShownRef = useRef(false);
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
            if (import.meta.env.DEV) console.log('[TTS] Skipping duplicate:', sentence);
            continue;
          }
          synthesizedRef.current.add(sentence);

          // Chain synthesis sequentially to preserve order
          const gen = ttsGenerationRef.current;
          synthQueueRef.current = synthQueueRef.current.then(async () => {
            if (gen !== ttsGenerationRef.current) return; // Stale — discard
            if (import.meta.env.DEV) console.log('[TTS] Synthesizing:', sentence);
            markSynthStartRef.current();
            try {
              const result = await ttsService.synthesize(sentence);
              if (gen !== ttsGenerationRef.current) return; // Stale after await
              if (result) {
                markSynthDoneRef.current();
                markPlayStartRef.current();
                const expr = currentExpressionRef.current;
                addAudioTaskRef.current({
                  audioBase64: result.audioBase64,
                  volumes: result.volumes,
                  sliceLength: result.sliceLength,
                  displayText: { text: sentence, name: BRAND_NAME_SHORT, avatar: '' },
                  expressions: expr ? [expr] : null,
                  forwarded: false,
                });
              } else {
                // synthesize() caught internally and returned null — surface the error
                markSynthErrorRef.current('TTS synthesis returned no audio');
                if (!ttsErrorShownRef.current) {
                  ttsErrorShownRef.current = true;
                  toaster.create({
                    title: i18next.t('notification.voiceSynthUnavailable'),
                    type: 'warning',
                    duration: 4000,
                  });
                }
              }
            } catch (err) {
              if (gen !== ttsGenerationRef.current) return; // Stale — suppress error
              console.error('[TTS] Synthesis failed:', err);
              markSynthErrorRef.current(err instanceof Error ? err.message : 'TTS synthesis failed');
              if (!ttsErrorShownRef.current) {
                ttsErrorShownRef.current = true;
                toaster.create({
                  title: i18next.t('notification.voiceSynthUnavailable'),
                  type: 'warning',
                  duration: 4000,
                });
              }
            }
          });
        }

        lastTtsTextRef.current = fullText;
      }

      // Reset TTS text tracking on conversation chain start
      if (msg.type === 'control' && msg.text === 'conversation-chain-start') {
        lastTtsTextRef.current = '';
        synthesizedRef.current.clear();
        ttsErrorShownRef.current = false;
      }
    });

    return () => sub.unsubscribe();
  }, []); // Stable: never tears down

  // ─── sendMessage: intercept ALL legacy message types ──────────

  const sendMessage = useCallback((message: LegacyMessage) => {
    switch (message.type) {
      // ── Phase 2: Text input → Gateway chat.send (with billing check) ──
      case 'text-input':
        if (message.text) {
          const text = message.text;
          // Guest message limit check
          if (!apiClient.getToken()) {
            guestMessageCountRef.current++;
            if (guestMessageCountRef.current > GUEST_MESSAGE_LIMIT) {
              setBillingModalRef.current({
                open: true,
                reason: 'guest_limit',
                message: i18next.t('billing.guestLimitMessage'),
              });
              window.dispatchEvent(new CustomEvent('send-failed', { detail: { text } }));
              return;
            }
          }
          // Billing check before sending
          checkBilling().then((allowed) => {
            if (!allowed) {
              window.dispatchEvent(new CustomEvent('send-failed', { detail: { text } }));
              return;
            }
            // Mark pending to suppress stale conversation-chain-end idle transition
            pendingNewChatRef.current = true;
            ttsGenerationRef.current++;
            audioTaskQueue.clearQueue();
            // Optimistic: show thinking indicator immediately instead of
            // waiting for Gateway's conversation-chain-start lifecycle event
            clearResponseRef.current();
            setAiStateRef.current('thinking-speaking');
            gatewayConnector.sendChat(sessionKeyRef.current, text).catch((err) => {
              console.error('[Gateway] sendChat failed:', err);
              toaster.create({
                title: i18next.t('notification.sendFailed', { error: err.message }),
                type: 'error',
                duration: 3000,
              });
              // Restore the input text so the user doesn't have to retype
              window.dispatchEvent(new CustomEvent('send-failed', { detail: { text } }));
              pendingNewChatRef.current = false;
              setAiStateRef.current('idle');
            });
          });
        }
        return;

      // ── Phase 5: Interrupt → Gateway abort ──
      case 'interrupt-signal': {
        // Stop local TTS pipeline immediately — discard in-flight synthesis
        ttsGenerationRef.current++;
        audioTaskQueue.clearQueue();
        const runId = gatewayAdapter.getActiveRunId();
        if (runId) {
          gatewayConnector.abortRun(runId).catch((err) => {
            console.error('[Gateway] abortRun failed:', err);
            toaster.create({
              title: i18next.t('notification.stopFailed'),
              type: 'error',
              duration: 3000,
            });
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
          const trimmed = transcript.trim();
          // Billing check before sending voice message
          checkBilling().then((allowed) => {
            if (!allowed) return;
            // Mark pending to suppress stale conversation-chain-end idle transition
            pendingNewChatRef.current = true;
            // Increment TTS generation to discard any stale in-flight synthesis
            ttsGenerationRef.current++;
            audioTaskQueue.clearQueue();
            appendHumanMessageRef.current(trimmed);
            // Optimistic: show thinking indicator immediately
            clearResponseRef.current();
            setAiStateRef.current('thinking-speaking');
            gatewayConnector.sendChat(sessionKeyRef.current, trimmed).catch((err) => {
              console.error('[Gateway] sendChat (ASR) failed:', err);
              toaster.create({
                title: i18next.t('notification.voiceSendFailed', { error: err.message }),
                type: 'error',
                duration: 3000,
              });
              pendingNewChatRef.current = false;
              setAiStateRef.current('idle');
            });
          });
        } else {
          if (import.meta.env.DEV) console.warn('[ASR] No transcript available from speech recognition');
          toaster.create({
            title: i18next.t('notification.noSpeechDetected'),
            type: 'info',
            duration: 3000,
          });
          setAiStateRef.current('idle');
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
          toaster.create({
            title: i18next.t('notification.proactiveSpeakFailed'),
            type: 'error',
            duration: 3000,
          });
          setAiStateRef.current('idle');
        });
        return;

      // ── Phase 6: Session management ──
      case 'fetch-and-set-history':
        if (msg.history_uid) {
          // Sync sessionKeyRef so subsequent sendChat uses the selected session
          const targetUid = msg.history_uid;
          sessionKeyRef.current = targetUid;
          setCurrentHistoryUidRef.current(targetUid);
          gatewayConnector.getChatHistory(targetUid).then((res) => {
            // Stale-check: if the user switched sessions again before this
            // resolved, discard the result to avoid overwriting the new session.
            if (sessionKeyRef.current !== targetUid) return;
            if (res.payload?.messages) {
              setMessagesRef.current(res.payload.messages);
            } else {
              // Gateway may return empty or different format
              setMessagesRef.current([]);
            }
            toaster.create({
              title: i18next.t('notification.sessionLoaded'),
              type: 'success',
              duration: 2000,
            });
          }).catch((err) => {
            console.error('[Gateway] getChatHistory failed:', err);
            toaster.create({
              title: i18next.t('notification.loadSessionFailed', { error: err.message }),
              type: 'error',
              duration: 2000,
            });
          });
        }
        return;

      case 'create-new-history': {
        const newSessionKey = `agent:${getAgentId()}:${crypto.randomUUID()}`;
        gatewayConnector.resolveSession(newSessionKey, getAgentId()).then(() => {
          // Sync sessionKeyRef so subsequent sendChat uses the new session
          sessionKeyRef.current = newSessionKey;
          setCurrentHistoryUidRef.current(newSessionKey);
          setMessagesRef.current([]);
          const newHistory: HistoryInfo = {
            uid: newSessionKey,
            latest_message: null,
            timestamp: new Date().toISOString(),
          };
          setHistoryListRef.current((prev: HistoryInfo[]) => [newHistory, ...prev]);
          setAiStateRef.current('idle');
          setSubtitleTextRef.current('');
          toaster.create({
            title: i18next.t('notification.newConversationCreated'),
            type: 'success',
            duration: 2000,
          });
          // Auto-greeting for the new session — show thinking indicator
          // immediately to avoid empty-state flash (same as initial page load path)
          setAiStateRef.current('thinking-speaking');
          setGreetingExpression(200); // Model is already loaded
          const newPrefs = localStorage.getItem('ling-user-preferences');
          const newGreetingMsg = newPrefs ? `[greeting:context]${newPrefs}` : '[greeting]';
          gatewayConnector.sendChat(newSessionKey, newGreetingMsg).catch((err) => {
            if (import.meta.env.DEV) console.error('[WebSocketHandler] New session greeting failed:', err);
            setAiStateRef.current('idle');
          });
        }).catch((err) => {
          console.error('[Gateway] resolveSession failed:', err);
          toaster.create({
            title: i18next.t('notification.createConversationFailed'),
            type: 'error',
            duration: 3000,
          });
        });
        return;
      }

      case 'fetch-history-list':
        gatewayConnector.listSessions().then((res) => {
          if (res.payload?.sessions) {
            const historyList: HistoryInfo[] = res.payload.sessions.map((s) => ({
              uid: s.key || s.id,
              latest_message: s.lastMessage || null,
              timestamp: s.updatedAt || s.createdAt || new Date().toISOString(),
            }));
            setHistoryListRef.current(historyList);
          }
        }).catch((err) => {
          console.error('[Gateway] listSessions failed:', err);
          toaster.create({
            title: i18next.t('notification.loadSessionsFailed'),
            type: 'error',
            duration: 3000,
          });
        });
        return;

      case 'delete-history':
        if (msg.history_uid) {
          // Remove from local list (Gateway may not support delete)
          setHistoryListRef.current((prev: HistoryInfo[]) =>
            prev.filter((h: HistoryInfo) => h.uid !== msg.history_uid)
          );
          toaster.create({
            title: i18next.t('notification.sessionDeleted'),
            type: 'success',
            duration: 2000,
          });
        }
        return;

      // ── Phase 6: Config/background — handled locally ──
      case 'switch-config':
        // In Gateway mode, character switching is handled locally
        // The model info is set directly without backend involvement
        if (import.meta.env.DEV) console.log('[Gateway] switch-config intercepted, handled locally');
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
        if (import.meta.env.DEV) console.log('[Gateway] Unhandled sendMessage type:', msg.type);
        return;
    }
  }, []);

  const webSocketContextValue = useMemo(() => ({
    sendMessage,
    wsState,
    reconnect: () => {
      gatewayConnector.disconnect();
      gatewayAdapter.reset();
      setAiState('idle');
      gatewayConnector.connect({
        url: gwUrl,
        token: GATEWAY_TOKEN,
        clientId: 'webchat-ui',
        displayName: BRAND_AVATAR_NAME,
      }).then(() => {
        // Re-resolve session after manual reconnect
        gatewayConnector.resolveSession(sessionKeyRef.current, getAgentId()).catch((err) => {
          console.error('[WebSocketHandler] Manual reconnect resolveSession failed:', err);
        });
        toaster.create({
          title: i18next.t('notification.connectionRestored'),
          type: 'success',
          duration: 3000,
        });
      }).catch((err) => {
        console.error('[WebSocketHandler] Manual reconnect failed:', err);
        toaster.create({
          title: i18next.t('notification.connectionFailed', { error: err.message }),
          type: 'error',
          duration: 5000,
        });
      });
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
