/* eslint-disable no-sparse-arrays */
/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line object-curly-newline
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageEvent, wsService } from '@/services/websocket-service';
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
// Gateway imports removed — using direct Engine WebSocket
import { ttsService } from '@/services/tts-service';
import { asrService } from '@/services/asr-service';
import { useTTSState } from '@/context/tts-state-context';
import { isMobileViewport } from '@/constants/breakpoints';
import { useAuth } from '@/context/auth-context';
import { useUI } from '@/context/ui-context';
import { apiClient } from '@/services/api-client';
import i18next from 'i18next';

// ─── WebSocket configuration ──────────────────────────────────────

function getDefaultWsUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://127.0.0.1:12393/client-ws';
  }
  return 'wss://lain.sngxai.com/client-ws';
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

// ─── Greeting expression helper ─────────────────────────────────

/** Set a welcoming expression (kaixin/happy) on the Live2D model during greeting.
 *  Delayed to ensure the model is loaded — longer delay for initial page load. */
function setGreetingExpression(delayMs = 200) {
  setTimeout(() => {
    const lappAdapter = (window as any).getLAppAdapter?.();
    if (lappAdapter) {
      try { lappAdapter.setExpression('kaixin'); } catch { /* model may not be ready */ }
    }
  }, delayMs);
}

// Debug panel removed (Gateway-specific)

// ─── Component ──────────────────────────────────────────────────

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<string>('CLOSED');
  const [gwUrl, setGwUrl] = useLocalStorage<string>('gwUrl', getDefaultWsUrl());
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

  const clearResponseRef = useRef(clearResponse);
  useEffect(() => { clearResponseRef.current = clearResponse; }, [clearResponse]);

  // Per-visitor session key (stable across renders)
  const sessionKeyRef = useRef(crypto.randomUUID());

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
          reason: data.reason as any,
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
          const aMsg = message as any;
          affinityContext.updateAffinity(aMsg.affinity, aMsg.level);
        }
        break;
      case 'affinity-milestone':
        if (affinityContext) {
          const mMsg = message as any;
          affinityContext.showMilestone(message.content || i18next.t('notification.affinityReached', { milestone: mMsg.milestone }));
          // Upgrade prompt for free users at 'friendly' milestone
          if ((mMsg as any).level === 'friendly' || mMsg.milestone === 'friendly') {
            const currentUser = userRef.current;
            if (currentUser && (currentUser as any).plan === 'free') {
              setTimeout(() => {
                setBillingModalRef.current({
                  open: true,
                  reason: 'affinity_milestone' as any,
                  message: i18next.t('billing.affinityUpgradeMessage'),
                });
              }, 3000);
            }
          }
        }
        break;
      case 'emotion-expression':
        if (affinityContext) {
          const eMsg = message as any;
          affinityContext.setExpression(eMsg.expression, eMsg.intensity || 0.5);
        }
        break;

      // ── Engine direct-mode message types ──
      case 'set-model-and-conf':
        // Model info is hardcoded in LING_MODEL_INFO, ignore engine's
        break;
      case 'config-files':
      case 'background-files':
        // Pre-populated locally on connect
        break;
      case 'audio':
        // Engine sends server-side TTS audio — ignored since we use client-side TTS
        break;
      case 'history-data':
        if (message.messages) {
          setMessages(message.messages);
        }
        break;
      case 'new-history-created':
        if (message.history_uid) {
          setCurrentHistoryUid(message.history_uid);
          setMessages([]);
        }
        break;
      case 'history-deleted':
        break;
      case 'history-list':
        if (message.histories) {
          setHistoryList(message.histories);
        }
        break;
      case 'user-input-transcription':
        if (message.text) {
          appendHumanMessage(message.text);
        }
        break;
      case 'group-update':
      case 'group-operation-result':
        break;

      default:
        // Suppress noisy warnings for known-unhandled types
        break;
    }
  }, [aiState, appendHumanMessage, appendAIMessage, baseUrl, bgUrlContext, setAiState, setConfName, setConfUid, setConfigFiles, setCurrentHistoryUid, setHistoryList, setMessages, setModelInfo, setSubtitleText, setFullResponse, startMic, stopMic, setSelfUid, setGroupMembers, setIsOwner, backendSynthComplete, setBackendSynthComplete, clearResponse, handleControlMessage, appendOrUpdateToolCallMessage, interrupt, setBrowserViewData, t, affinityContext]);

  // ─── Connect to Engine WebSocket on mount / URL change ─────────

  useEffect(() => {
    // Connect directly to Ling Engine WebSocket
    wsService.connect(gwUrl);

    // Initialize: set model info directly (no backend fetch needed)
    setConfName('灵 (Ling)');
    setConfUid('ling-default');
    setSelfUid(crypto.randomUUID());
    setPendingModelInfo(LING_MODEL_INFO);
    setAiState('idle');

    // Pre-populate config files and backgrounds locally
    setConfigFiles(DEFAULT_CONFIG_FILES);
    bgUrlContext?.setBackgroundFiles(DEFAULT_BACKGROUNDS);

    return () => {
      wsService.disconnect();
    };
  }, [gwUrl]);

  // ─── Subscribe to Gateway events (stable — never tears down) ───

  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => { handleWebSocketMessageRef.current = handleWebSocketMessage; }, [handleWebSocketMessage]);

  useEffect(() => {
    // Subscribe to Engine WebSocket state changes
    const stateSub = wsService.onStateChange((state) => {
      setWsState(state);
      if (state === 'CLOSED') {
        toaster.create({
          title: i18next.t('notification.connectionLost'),
          type: 'warning',
          duration: 4000,
        });
      }
    });

    // ── Response timeout: detect when AI hangs mid-response ──
    const RESPONSE_TIMEOUT_MS = 60_000;
    let lastActivity = 0;
    const responseCheckTimer = setInterval(() => {
      if (lastActivity > 0 && Date.now() - lastActivity > RESPONSE_TIMEOUT_MS) {
        lastActivity = 0;
        toaster.create({
          title: i18next.t('notification.responseTimeout'),
          type: 'warning',
          duration: 5000,
        });
        setAiStateRef.current('idle');
        setSubtitleTextRef.current('');
      }
    }, 10_000);

    // Subscribe to Engine messages directly (no adapter needed — engine sends MessageEvent format)
    const messageSub = wsService.onMessage((msg) => {
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

    // Network recovery: reconnect when browser comes back online
    const onOnline = () => wsService.connect(getDefaultWsUrl());
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(responseCheckTimer);
      window.removeEventListener('online', onOnline);
      stateSub.unsubscribe();
      messageSub.unsubscribe();
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
    const sub = wsService.onMessage((msg) => {
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
                  displayText: { text: sentence, name: '灵', avatar: '' },
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

  // ─── sendMessage: forward to Engine WebSocket directly ──────────

  const sendMessage = useCallback((message: object) => {
    const msg = message as any;

    switch (msg.type) {
      // ── Text input (with billing check) ──
      case 'text-input':
        if (msg.text) {
          checkBilling().then((allowed) => {
            if (!allowed) return;
            pendingNewChatRef.current = true;
            ttsGenerationRef.current++;
            audioTaskQueue.clearQueue();
            clearResponseRef.current();
            setAiStateRef.current('thinking-speaking');
            wsService.sendMessage(message);
          });
        }
        return;

      // ── Interrupt ──
      case 'interrupt-signal':
        ttsGenerationRef.current++;
        audioTaskQueue.clearQueue();
        wsService.sendMessage(message);
        return;

      // ── Voice input ──
      case 'mic-audio-end': {
        const transcript = asrService.stop();
        if (transcript.trim()) {
          const trimmed = transcript.trim();
          checkBilling().then((allowed) => {
            if (!allowed) return;
            pendingNewChatRef.current = true;
            ttsGenerationRef.current++;
            audioTaskQueue.clearQueue();
            appendHumanMessageRef.current(trimmed);
            clearResponseRef.current();
            setAiStateRef.current('thinking-speaking');
            wsService.sendMessage({ type: 'text-input', text: trimmed });
          });
        } else {
          toaster.create({
            title: i18next.t('notification.noSpeechDetected'),
            type: 'info',
            duration: 3000,
          });
          setAiStateRef.current('idle');
        }
        return;
      }

      // ── Proactive speak ──
      case 'ai-speak-signal':
        wsService.sendMessage({ type: 'text-input', text: '[proactive-speak]' });
        return;

      // ── Drop raw audio (ASR runs client-side) ──
      case 'mic-audio-data':
        return;

      // ── All other types: pass through to engine directly ──
      default:
        wsService.sendMessage(message);
        return;
    }
  }, []);

  const webSocketContextValue = useMemo(() => ({
    sendMessage,
    wsState,
    reconnect: () => {
      wsService.disconnect();
      setAiState('idle');
      wsService.connect(gwUrl);
    },
    wsUrl: gwUrl,
    setWsUrl: setGwUrl,
    baseUrl,
    setBaseUrl,
  }), [sendMessage, wsState, gwUrl, baseUrl]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      {/* Debug panel removed */}
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
