/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useChatMessages, useStreamingSetters } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { audioManager } from '@/utils/audio-manager';
import { createLogger } from '@/utils/logger';
import { toaster } from '@/components/ui/toaster';
import { DisplayText } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

const log = createLogger('AudioTask');

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  mouthForms?: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  speaker_uid?: string
  forwarded?: boolean
}

/**
 * Custom hook for handling audio playback tasks with Live2D lip sync
 */
export const useAudioTask = () => {
  const { t } = useTranslation();
  const { aiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendAIMessage } = useChatMessages();
  const { appendResponse } = useStreamingSetters();
  const { setExpression } = useLive2DExpression();

  // State refs to avoid stale closures
  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });

  // Note: currentAudioRef and currentModelRef are now managed by the global audioManager

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };

  /**
   * Stop current audio playback and lip sync (delegates to global audioManager)
   */
  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  /**
   * Handle audio playback with Live2D lip sync
   */
  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    // Skip if already interrupted
    if (currentAiState === 'interrupted') {
      log.debug('Audio playback blocked by interruption state.');
      resolve();
      return;
    }

    const { audioBase64, displayText, expressions, volumes, mouthForms } = options;

    // Update display text
    if (displayText) {
      appendText(displayText.text);
      appendAI(displayText.text, displayText.name, displayText.avatar);
      if (audioBase64) {
        updateSubtitle(displayText.text);
      }
    }

    try {
      // Process audio if available
      if (audioBase64) {
        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;

        // Get Live2D manager and model
        const live2dManager = window.getLive2DManager?.();
        if (!live2dManager) {
          log.error('Live2D manager not found');
          resolve();
          return;
        }

        const model = live2dManager.getModel(0);
        if (!model) {
          log.error('Live2D model not found at index 0');
          resolve();
          return;
        }

        // Set expression if available
        const lappAdapter = window.getLAppAdapter?.();
        if (lappAdapter && expressions?.[0] !== undefined) {
          setExpression(
            expressions[0],
            lappAdapter,
          );
        }

        // Start talk motion
        if (LAppDefine && LAppDefine.PriorityNormal) {
          model.startRandomMotion(
            "Talk",
            LAppDefine.PriorityNormal,
          );
        }

        // Setup audio element
        const audio = new Audio(audioDataUrl);

        // Register with global audio manager IMMEDIATELY after creating audio
        audioManager.setCurrentAudio(audio, model);
        let isFinished = false;
        let lipSyncRafId: number | null = null;

        const cleanup = () => {
          if (lipSyncRafId !== null) {
            cancelAnimationFrame(lipSyncRafId);
            lipSyncRafId = null;
          }
          // Reset lip sync state on the model
          if (model._wavFileHandler) {
            model._wavFileHandler._lastRms = 0.0;
          }
          audioManager.clearCurrentAudio(audio);
          if (!isFinished) {
            isFinished = true;
            resolve();
          }
        };

        audio.addEventListener('canplaythrough', () => {
          // Check for interruption before playback
          if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            cleanup();
            return;
          }

          audio.play().catch((err) => {
            log.error('Audio play error:', err);
            cleanup();
          });

          // ── Drive lip sync from pre-computed volumes ──
          // The _wavFileHandler.update() in lappmodel.ts reads getRms() each frame.
          // For MP3 audio, the WAV parser fails and _pcmData is null, so update()
          // always returns _lastRms=0. We bypass this by directly setting _lastRms
          // from our pre-computed volume data, synced to audio.currentTime.
          if (model._wavFileHandler && volumes && volumes.length > 0) {
            const fps = 30;

            // Override getRms to return our driven value
            if (!model._wavFileHandler._lipSyncOverridden) {
              model._wavFileHandler._lipSyncOverridden = true;
              model._wavFileHandler._externalRms = 0;
              const origGetRms = model._wavFileHandler.getRms.bind(model._wavFileHandler);
              model._wavFileHandler.getRms = function () {
                // If external driving is active, use that value;
                // otherwise fall back to original (for WAV files that work natively)
                // @ts-ignore
                return this._externalRms > 0 ? this._externalRms : origGetRms();
              };
            }

            // Also find ParamMouthForm ID on the model for mouth shape
            let mouthFormParamIndex = -1;
            if (mouthForms && mouthForms.length > 0 && model._model) {
              try {
                // Try to find ParamMouthForm parameter index
                const paramCount = model._model.getParameterCount?.() ?? 0;
                for (let p = 0; p < paramCount; p++) {
                  const id = model._model.getParameterId?.(p);
                  if (id && id.getString?.() === 'ParamMouthForm') {
                    mouthFormParamIndex = p;
                    break;
                  }
                }
              } catch {
                // Parameter lookup failed, skip MouthForm
              }
            }

            const driveLipSync = () => {
              if (isFinished || audio.paused || audio.ended) return;

              const time = audio.currentTime;
              const frameIndex = Math.min(
                Math.floor(time * fps),
                volumes.length - 1
              );

              // Set external RMS for the model's lip sync loop to pick up
              model._wavFileHandler._externalRms = volumes[frameIndex] ?? 0;

              // Drive MouthForm directly if parameter exists
              if (mouthFormParamIndex >= 0 && mouthForms && model._model) {
                const formValue = mouthForms[frameIndex] ?? 0.5;
                // ParamMouthForm range: typically -1 to 1 or 0 to 1
                // Map our 0-1 to a subtle range to avoid extreme deformation
                try {
                  model._model.setParameterValueByIndex(
                    mouthFormParamIndex,
                    formValue * 0.6 - 0.1, // Slight bias toward narrower
                    1.0
                  );
                } catch {
                  // Ignore if parameter setting fails
                }
              }

              lipSyncRafId = requestAnimationFrame(driveLipSync);
            };

            lipSyncRafId = requestAnimationFrame(driveLipSync);
          }
        });

        audio.addEventListener('ended', () => {
          cleanup();
        });

        audio.addEventListener('error', (error) => {
          log.error('Audio playback error:', error);
          cleanup();
        });

        audio.load();
      } else {
        resolve();
      }
    } catch (error) {
      log.error('Audio playback setup error:', error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: "error",
        duration: 2000,
      });
      resolve();
    }
  });

  // Handle backend synthesis completion
  useEffect(() => {
    let isMounted = true;

    const handleComplete = async () => {
      await audioTaskQueue.waitForCompletion();
      if (isMounted && backendSynthComplete) {
        stopCurrentAudioAndLipSync();
        setBackendSynthComplete(false);
      }
    };

    handleComplete();

    return () => {
      isMounted = false;
    };
  }, [backendSynthComplete, setBackendSynthComplete, stopCurrentAudioAndLipSync]);

  /**
   * Add a new audio task to the queue
   */
  const addAudioTask = useCallback((options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      if (import.meta.env.DEV) console.log('Skipping audio task due to interrupted state');
      return;
    }

    if (import.meta.env.DEV) console.log(`[AudioTask] Queuing: ${options.displayText?.text?.slice(0, 30)}`);
    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  }, []);

  return {
    addAudioTask,
    appendResponse,
    stopCurrentAudioAndLipSync,
  };
};
