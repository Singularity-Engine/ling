import {
  createContext, useContext, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { MicVAD } from '@ricky0123/vad-web';
import { useInterrupt } from '@/components/canvas/live2d';
import { audioTaskQueue } from '@/utils/task-queue';
import { useSendAudio } from '@/hooks/utils/use-send-audio';
import { useSubtitleActions } from './subtitle-context';
import { useAiStateRead, useAiStateActions, type AiState } from './ai-state-context';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { toaster } from '@/components/ui/toaster';
import { createLogger } from '@/utils/logger';

const log = createLogger('VAD');

/**
 * VAD settings configuration interface
 * @interface VADSettings
 */
export interface VADSettings {
  /** Threshold for positive speech detection (0-100) */
  positiveSpeechThreshold: number;

  /** Threshold for negative speech detection (0-100) */
  negativeSpeechThreshold: number;

  /** Number of frames for speech redemption */
  redemptionFrames: number;
}

/**
 * Context 1 — Read-only VAD state.
 * Changes when micOn, autoStopMic, settings, or auto-start flags update.
 */
interface VADStateReadType {
  micOn: boolean;
  autoStopMic: boolean;
  autoStartMicOn: boolean;
  autoStartMicOnConvEnd: boolean;
  settings: VADSettings;
}

/**
 * Context 2 — Stable action callbacks.
 * All callbacks use useCallback with empty/stable deps, so this
 * context value never changes after mount. Consumers that only
 * WRITE VAD state subscribe here without re-renders on state changes.
 */
interface VADActionsType {
  startMic: () => Promise<void>;
  stopMic: () => void;
  setAutoStopMic: (value: boolean) => void;
  setAutoStartMicOn: (value: boolean) => void;
  setAutoStartMicOnConvEnd: (value: boolean) => void;
  updateSettings: (newSettings: VADSettings) => void;
}

/**
 * Default values and constants
 */
const DEFAULT_VAD_SETTINGS: VADSettings = {
  positiveSpeechThreshold: 50,
  negativeSpeechThreshold: 35,
  redemptionFrames: 35,
};

const DEFAULT_VAD_STATE = {
  micOn: false,
  autoStopMic: false,
  autoStartMicOn: false,
  autoStartMicOnConvEnd: false,
};

const VADStateReadContext = createContext<VADStateReadType | null>(null);
const VADActionsContext = createContext<VADActionsType | null>(null);

/**
 * VAD Provider Component
 * Manages voice activity detection and microphone state
 */
export function VADProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  // Refs for VAD instance and state
  const vadRef = useRef<MicVAD | null>(null);
  const previousTriggeredProbabilityRef = useRef(0);
  const previousAiStateRef = useRef<AiState>('idle');

  // Persistent state management
  const [micOn, setMicOn] = useLocalStorage('micOn', DEFAULT_VAD_STATE.micOn);
  const autoStopMicRef = useRef(true);
  const [autoStopMic, setAutoStopMicState] = useLocalStorage(
    'autoStopMic',
    DEFAULT_VAD_STATE.autoStopMic,
  );
  const [settings, setSettings] = useLocalStorage<VADSettings>(
    'vadSettings',
    DEFAULT_VAD_SETTINGS,
  );
  const [autoStartMicOn, setAutoStartMicOnState] = useLocalStorage(
    'autoStartMicOn',
    DEFAULT_VAD_STATE.autoStartMicOn,
  );
  const autoStartMicRef = useRef(false);
  const [autoStartMicOnConvEnd, setAutoStartMicOnConvEndState] = useLocalStorage(
    'autoStartMicOnConvEnd',
    DEFAULT_VAD_STATE.autoStartMicOnConvEnd,
  );
  const autoStartMicOnConvEndRef = useRef(false);

  // External hooks and contexts
  const { interrupt } = useInterrupt();
  const { sendAudioPartition } = useSendAudio();
  const { setSubtitleText } = useSubtitleActions();
  const { aiState } = useAiStateRead();
  const { setAiState } = useAiStateActions();

  // Refs for callback stability — direct assignment keeps them current
  // synchronously during render, before any async callbacks can fire.
  const interruptRef = useRef(interrupt);
  interruptRef.current = interrupt;
  const sendAudioPartitionRef = useRef(sendAudioPartition);
  sendAudioPartitionRef.current = sendAudioPartition;
  const aiStateRef = useRef<AiState>(aiState);
  aiStateRef.current = aiState;
  const setSubtitleTextRef = useRef(setSubtitleText);
  setSubtitleTextRef.current = setSubtitleText;
  const setAiStateRef = useRef(setAiState);
  setAiStateRef.current = setAiState;
  autoStopMicRef.current = autoStopMic;
  autoStartMicRef.current = autoStartMicOn;
  autoStartMicOnConvEndRef.current = autoStartMicOnConvEnd;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const isProcessingRef = useRef(false);
  const settingsRestartTimer = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup on unmount — destroy VAD (releases microphone hardware) + clear timers.
  // Without this, navigating away while mic is active leaks the MediaStream.
  useEffect(() => {
    return () => {
      if (settingsRestartTimer.current) clearTimeout(settingsRestartTimer.current);
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
    };
  }, []);

  /**
   * Update previous triggered probability (ref-based, non-reactive)
   */
  const setPreviousTriggeredProbability = useCallback((value: number) => {
    previousTriggeredProbabilityRef.current = value;
  }, []);

  /**
   * Stop microphone and VAD processing.
   * Defined before speech handlers so they can reference it without
   * triggering the no-use-before-define lint rule.
   */
  const stopMic = useCallback(() => {
    log.debug('Stopping VAD');
    if (vadRef.current) {
      vadRef.current.pause();
      vadRef.current.destroy();
      vadRef.current = null;
      log.debug('VAD stopped and destroyed successfully');
      setPreviousTriggeredProbability(0);
    } else {
      log.debug('VAD instance not found');
    }
    setMicOn(false);
    isProcessingRef.current = false;
  }, []);

  /**
   * Handle speech start event (initial detection)
   */
  const handleSpeechStart = useCallback(() => {
    log.debug('Speech started - saving current state');
    // Save current AI state but DON'T change to listening yet
    previousAiStateRef.current = aiStateRef.current;
    isProcessingRef.current = true;
    // Don't change state here - wait for onSpeechRealStart
  }, []);

  /**
   * Handle real speech start event (confirmed speech)
   */
  const handleSpeechRealStart = useCallback(() => {
    log.debug('Real speech confirmed - checking if need to interrupt');
    // Check if we need to interrupt based on the PREVIOUS state (before speech started)
    if (previousAiStateRef.current === 'thinking-speaking') {
      log.debug('Interrupting AI speech due to user speaking');
      interruptRef.current();
    }
    // Now change to listening state
    setAiStateRef.current('listening');
  }, []);

  /**
   * Handle frame processing event
   */
  const handleFrameProcessed = useCallback((probs: { isSpeech: number }) => {
    if (probs.isSpeech > previousTriggeredProbabilityRef.current) {
      setPreviousTriggeredProbability(probs.isSpeech);
    }
  }, []);

  /**
   * Handle speech end event
   */
  const handleSpeechEnd = useCallback((audio: Float32Array) => {
    if (!isProcessingRef.current) return;
    log.debug('Speech ended');
    audioTaskQueue.clearQueue();

    if (autoStopMicRef.current) {
      stopMic();
    } else {
      log.debug('Auto stop mic is OFF, keeping mic active');
    }

    setPreviousTriggeredProbability(0);
    sendAudioPartitionRef.current(audio);
    isProcessingRef.current = false;
    setAiStateRef.current("thinking-speaking");
  }, []);

  /**
   * Handle VAD misfire event
   */
  const handleVADMisfire = useCallback(() => {
    if (!isProcessingRef.current) return;
    log.debug('VAD misfire detected');
    setPreviousTriggeredProbability(0);
    isProcessingRef.current = false;

    // Restore previous AI state and show helpful misfire message
    setAiStateRef.current(previousAiStateRef.current);
    setSubtitleTextRef.current(t('error.vadMisfire'));
  }, [t]);

  /**
   * Initialize new VAD instance
   */
  const initVAD = async () => {
    const { MicVAD } = await import('@ricky0123/vad-web');
    const newVAD = await MicVAD.new({
      model: "v5",
      preSpeechPadFrames: 20,
      positiveSpeechThreshold: settingsRef.current.positiveSpeechThreshold / 100,
      negativeSpeechThreshold: settingsRef.current.negativeSpeechThreshold / 100,
      redemptionFrames: settingsRef.current.redemptionFrames,
      baseAssetPath: './libs/',
      onnxWASMBasePath: './libs/',
      onSpeechStart: handleSpeechStart,
      onSpeechRealStart: handleSpeechRealStart,
      onFrameProcessed: handleFrameProcessed,
      onSpeechEnd: handleSpeechEnd,
      onVADMisfire: handleVADMisfire,
    });

    vadRef.current = newVAD;
    newVAD.start();
  };

  /**
   * Start microphone and VAD processing
   */
  const startMic = useCallback(async () => {
    try {
      if (!vadRef.current) {
        log.debug('Initializing VAD');
        await initVAD();
      } else {
        log.debug('Starting VAD');
        vadRef.current.start();
      }
      setMicOn(true);
    } catch (error) {
      log.error('Failed to start VAD:', error);
      toaster.create({
        title: t('error.failedStartVAD'),
        type: 'error',
        duration: 4000,
      });
    }
  }, [t]);

  /**
   * Update VAD settings and restart if active
   */
  const updateSettings = useCallback((newSettings: VADSettings) => {
    settingsRef.current = newSettings;
    setSettings(newSettings);
    if (vadRef.current) {
      // Debounce: defer the full stop+restart until user finishes adjusting,
      // so rapid slider changes don't repeatedly destroy/recreate the VAD.
      if (settingsRestartTimer.current) clearTimeout(settingsRestartTimer.current);
      settingsRestartTimer.current = setTimeout(() => {
        stopMic();
        startMic();
      }, 300);
    }
  }, []);

  const setAutoStopMic = useCallback((value: boolean) => {
    autoStopMicRef.current = value;
    setAutoStopMicState(value);
  }, []);

  const setAutoStartMicOn = useCallback((value: boolean) => {
    autoStartMicRef.current = value;
    setAutoStartMicOnState(value);
  }, []);

  const setAutoStartMicOnConvEnd = useCallback((value: boolean) => {
    autoStartMicOnConvEndRef.current = value;
    setAutoStartMicOnConvEndState(value);
  }, []);

  const actions = useMemo(
    () => ({
      startMic,
      stopMic,
      setAutoStopMic,
      setAutoStartMicOn,
      setAutoStartMicOnConvEnd,
      updateSettings,
    }),
    [startMic, stopMic, setAutoStopMic, setAutoStartMicOn, setAutoStartMicOnConvEnd, updateSettings],
  );

  const state = useMemo(
    () => ({
      micOn,
      autoStopMic,
      autoStartMicOn,
      autoStartMicOnConvEnd,
      settings,
    }),
    [micOn, autoStopMic, autoStartMicOn, autoStartMicOnConvEnd, settings],
  );

  return (
    <VADActionsContext.Provider value={actions}>
      <VADStateReadContext.Provider value={state}>
        {children}
      </VADStateReadContext.Provider>
    </VADActionsContext.Provider>
  );
}

/** Subscribe to read-only VAD state (re-renders on state changes). */
export function useVADState() {
  const ctx = useContext(VADStateReadContext);
  if (!ctx) throw new Error('useVADState must be used within VADProvider');
  return ctx;
}

/** Subscribe to stable VAD actions (never causes re-renders). */
export function useVADActions() {
  const ctx = useContext(VADActionsContext);
  if (!ctx) throw new Error('useVADActions must be used within VADProvider');
  return ctx;
}

/**
 * Combined hook — returns both read-only state and actions.
 * Kept for backward compatibility with restricted files (hooks/utils/).
 * Prefer useVADState() or useVADActions() for targeted subscriptions.
 */
export function useVAD() {
  return { ...useVADState(), ...useVADActions() };
}
