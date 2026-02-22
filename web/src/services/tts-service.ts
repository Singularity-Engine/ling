/**
 * Frontend TTS Service — Fish Audio API
 *
 * Synthesizes speech directly from the browser, replacing the
 * backend TTS pipeline. Returns base64 audio + volume data
 * compatible with the existing audio playback system.
 */

// ─── Configuration ───────────────────────────────────────────────

// TTS proxy URL — standalone TTS service (port 12394) with Engine BFF fallback (12393)
function getTTSProxyUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Dev: try standalone TTS proxy first, Engine BFF as fallback
    return 'http://127.0.0.1:12393/api/tts/generate';
  }
  // Production: Cloudflare tunnel routes tts.sngxai.com to localhost:14201
  return 'https://tts.sngxai.com/api/tts/generate';
}

const TTS_PROXY_URL = getTTSProxyUrl();
const FISH_TTS_REFERENCE_ID = '9dec9671824543b4a4f9f382dbf15748';

// Sentence boundary pattern (Chinese + English punctuation + newlines)
const SENTENCE_TERMINATORS = /[。！？.!?\n；;]/;

import { createLogger } from '@/utils/logger';

const log = createLogger('TTS');

// ─── Types ───────────────────────────────────────────────────────

export interface TTSResult {
  /** Base64-encoded WAV/MP3 audio */
  audioBase64: string;
  /** Volume levels per frame for lip sync (30fps), normalized 0-1 */
  volumes: number[];
  /** Mouth form values per frame (30fps), 0=round/narrow, 1=wide/smile */
  mouthForms: number[];
  /** Number of volume samples (same as volumes.length) */
  sliceLength: number;
}

// ─── Service ─────────────────────────────────────────────────────

class TTSService {
  private audioContext: AudioContext | null = null;

  /**
   * Synthesize speech for a text segment.
   * Returns base64 audio + volumes for the existing audio playback system.
   */
  async synthesize(text: string): Promise<TTSResult | null> {
    if (!text.trim()) return null;

    try {
      const audioBlob = await this.callFishAudio(text);
      if (!audioBlob) return null;

      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      const lipSyncData = await this.extractLipSyncData(arrayBuffer);

      return {
        audioBase64: base64,
        volumes: lipSyncData.volumes,
        mouthForms: lipSyncData.mouthForms,
        sliceLength: lipSyncData.volumes.length,
      };
    } catch (err) {
      log.error('Synthesis failed:', err);

      return null;
    }
  }

  /**
   * Extract complete sentences from accumulated text.
   * Given previous text and new full text, returns only newly completed sentences.
   */
  extractCompleteSentences(prevText: string, fullText: string): string[] {
    const sentences: string[] = [];

    // Work on the portion of text after prevText
    // But we need to consider the last incomplete sentence in prevText
    // Find the last sentence boundary in prevText
    let startIdx = 0;
    for (let i = prevText.length - 1; i >= 0; i--) {
      if (SENTENCE_TERMINATORS.test(prevText[i])) {
        startIdx = i + 1;
        break;
      }
    }

    // If prevText had no terminators, start from 0
    // Look through fullText from startIdx for complete sentences
    const textToScan = fullText.slice(startIdx);
    let currentSentence = '';

    for (const char of textToScan) {
      currentSentence += char;
      if (SENTENCE_TERMINATORS.test(char)) {
        const trimmed = currentSentence.trim();
        if (trimmed.length >= 2) {
          // Check if this sentence was already in prevText
          const sentenceEnd = startIdx + currentSentence.length;
          if (sentenceEnd > prevText.length) {
            sentences.push(trimmed);
          }
        }
        startIdx += currentSentence.length;
        currentSentence = '';
      }
    }

    return sentences;
  }

  /**
   * Extract trailing text after the last sentence terminator.
   * This is text that hasn't been synthesized because it lacks a terminator.
   * Returns empty string if there's no trailing text.
   */
  getTrailingText(fullText: string): string {
    let lastTermIdx = -1;
    for (let i = fullText.length - 1; i >= 0; i--) {
      if (SENTENCE_TERMINATORS.test(fullText[i])) {
        lastTermIdx = i;
        break;
      }
    }
    return lastTermIdx >= 0 ? fullText.slice(lastTermIdx + 1).trim() : fullText.trim();
  }

  // ── Private ────────────────────────────────────────────────────

  private async callFishAudio(text: string): Promise<Blob | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    // Phase 1: 通过后端代理请求 TTS，注入认证 token
    const token = localStorage.getItem('ling_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(TTS_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          reference_id: FISH_TTS_REFERENCE_ID,
          format: 'mp3',
          latency: 'normal',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`TTS proxy error ${response.status}: ${errText}`);
      }

      return response.blob();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async extractLipSyncData(
    arrayBuffer: ArrayBuffer
  ): Promise<{ volumes: number[]; mouthForms: number[] }> {
    try {
      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      return this.computeLipSyncData(audioBuffer);
    } catch (err) {
      log.error('Lip sync extraction failed:', err);
      return { volumes: [], mouthForms: [] };
    }
  }

  private computeLipSyncData(
    audioBuffer: AudioBuffer,
    fps = 30
  ): { volumes: number[]; mouthForms: number[] } {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const samplesPerFrame = Math.floor(sampleRate / fps);
    const rawRms: number[] = [];
    const mouthForms: number[] = [];

    // FFT size for spectral analysis
    const fftSize = 1024;

    for (let i = 0; i < channelData.length; i += samplesPerFrame) {
      const end = Math.min(i + samplesPerFrame, channelData.length);

      // ── RMS volume ──
      let sumSquares = 0;
      for (let j = i; j < end; j++) {
        sumSquares += channelData[j] * channelData[j];
      }
      rawRms.push(Math.sqrt(sumSquares / (end - i)));

      // ── Spectral centroid for mouth form ──
      // Extract a window for FFT-like analysis
      const windowSize = Math.min(fftSize, end - i);
      const windowStart = i;

      // Compute energy in low band (0-1kHz) vs high band (1k-4kHz)
      // Using zero-crossing rate as a lightweight proxy for spectral brightness
      let zeroCrossings = 0;
      let highFreqEnergy = 0;
      let totalEnergy = 0;
      for (let j = windowStart + 1; j < windowStart + windowSize; j++) {
        if (j >= channelData.length) break;
        // Zero-crossing rate correlates with spectral centroid
        if (
          (channelData[j] >= 0 && channelData[j - 1] < 0) ||
          (channelData[j] < 0 && channelData[j - 1] >= 0)
        ) {
          zeroCrossings++;
        }
        // Simple high-pass energy via difference (approximates high-freq content)
        const diff = channelData[j] - channelData[j - 1];
        highFreqEnergy += diff * diff;
        totalEnergy += channelData[j] * channelData[j];
      }

      // Normalize zero-crossing rate to approximate spectral brightness
      // Higher ZCR → brighter sound → wider mouth (like "ee", "aa")
      // Lower ZCR → darker sound → rounder mouth (like "oo", "uu")
      const zcr = zeroCrossings / windowSize;
      // Typical speech ZCR range is 0.02-0.15; map to 0-1
      const brightness = Math.min(1.0, Math.max(0, (zcr - 0.02) / 0.12));

      // Blend with high-freq ratio for more accuracy
      const hfRatio =
        totalEnergy > 1e-10
          ? Math.min(1.0, (highFreqEnergy / totalEnergy) * 2)
          : 0;
      // MouthForm: 0 = narrow/round, 1 = wide
      mouthForms.push(brightness * 0.6 + hfRatio * 0.4);
    }

    // ── Adaptive normalization ──
    // Use percentile-based normalization to handle varying recording levels
    if (rawRms.length === 0) return { volumes: [], mouthForms: [] };

    const sorted = [...rawRms].sort((a, b) => a - b);
    // Noise floor: 10th percentile (below this → silence)
    const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] || 0;
    // Peak reference: 95th percentile (avoid outlier spikes)
    const peakRef = sorted[Math.floor(sorted.length * 0.95)] || 0.01;
    const range = Math.max(peakRef - noiseFloor, 0.001);

    // ── Normalize + smooth ──
    const smoothingUp = 0.35; // Fast attack for opening mouth
    const smoothingDown = 0.15; // Slower release for natural closing
    const volumes: number[] = [];
    let smoothed = 0;

    for (let i = 0; i < rawRms.length; i++) {
      // Normalize: subtract noise floor, scale to 0-1 using peak reference
      let normalized = (rawRms[i] - noiseFloor) / range;
      // Apply slight power curve for more natural feel (quiet sounds less visible)
      normalized = Math.pow(Math.max(0, normalized), 0.8);
      // Clamp
      normalized = Math.min(1.0, Math.max(0, normalized));

      // Exponential smoothing with asymmetric attack/release
      const alpha = normalized > smoothed ? smoothingUp : smoothingDown;
      smoothed = smoothed + alpha * (normalized - smoothed);
      volumes.push(smoothed);

      // Also smooth mouth form
      if (i > 0) {
        mouthForms[i] = mouthForms[i - 1] + 0.3 * (mouthForms[i] - mouthForms[i - 1]);
      }
      // Suppress mouth form when volume is very low (silence → neutral)
      if (smoothed < 0.05) {
        mouthForms[i] *= smoothed / 0.05;
      }
    }

    return { volumes, mouthForms };
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunks: string[] = [];
    const CHUNK = 8192;
    for (let i = 0; i < bytes.byteLength; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    return btoa(chunks.join(''));
  }
}

/** Singleton instance */
export const ttsService = new TTSService();
