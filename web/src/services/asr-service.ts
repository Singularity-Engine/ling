/**
 * Frontend ASR Service — Web Speech API
 *
 * Provides speech-to-text using the browser's SpeechRecognition API.
 * Designed to run alongside VAD: start when mic turns on, stop when
 * speech ends, and provide the accumulated transcript.
 */

import { createLogger } from '@/utils/logger';

const log = createLogger('ASR');

class ASRService {
  private recognition: SpeechRecognition | null = null;
  private isListening = false;
  private currentTranscript = '';
  private finalTranscript = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  /** Whether Web Speech API is available in this browser */
  get isSupported(): boolean {
    return typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /** Start listening for speech */
  start() {
    if (this.isListening) return;
    if (!this.isSupported) {
      log.debug('SpeechRecognition not supported');
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'zh-CN';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      this.finalTranscript = final;
      this.currentTranscript = final + interim;
    };

    this.recognition.onend = () => {
      // SpeechRecognition auto-stops after silence; restart if still listening
      if (this.isListening) {
        this.restartTimer = setTimeout(() => {
          if (this.isListening && this.recognition) {
            try { this.recognition.start(); } catch { /* already running */ }
          }
        }, 100);
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      log.error('Error:', event.error);
    };

    try {
      this.recognition.start();
      this.isListening = true;
      this.currentTranscript = '';
      this.finalTranscript = '';
      log.debug('Started listening');
    } catch (err) {
      log.error('Failed to start:', err);
    }
  }

  /** Stop listening and return the accumulated transcript */
  stop(): string {
    this.isListening = false;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* already stopped */ }
      this.recognition = null;
    }

    const result = this.currentTranscript || this.finalTranscript;
    this.currentTranscript = '';
    this.finalTranscript = '';
    log.debug('Stopped, transcript:', result);
    return result;
  }

  /** Get current transcript without stopping */
  getTranscript(): string {
    return this.currentTranscript || this.finalTranscript;
  }

  /** Whether currently listening */
  get listening(): boolean {
    return this.isListening;
  }
}

/** Singleton instance */
export const asrService = new ASRService();
