/**
 * Frontend TTS Service — Fish Audio API
 *
 * Synthesizes speech directly from the browser, replacing the
 * backend TTS pipeline. Returns base64 audio + volume data
 * compatible with the existing audio playback system.
 */

// ─── Configuration ───────────────────────────────────────────────

const FISH_TTS_API = 'https://api.fish.audio/v1/tts';
const FISH_TTS_API_KEY = 'ceea7f5420dc4214807f4ce5dccb9da3';
const FISH_TTS_REFERENCE_ID = '9dec9671824543b4a4f9f382dbf15748';

// Fallback proxy for CORS issues
const FISH_TTS_PROXY = 'https://tts.sngxai.com/v1/tts';

// Sentence boundary pattern (Chinese + English punctuation + newlines)
const SENTENCE_TERMINATORS = /[。！？.!?\n；;]/;

// ─── Types ───────────────────────────────────────────────────────

export interface TTSResult {
  /** Base64-encoded WAV/MP3 audio */
  audioBase64: string;
  /** Volume levels per frame for lip sync (30fps) */
  volumes: number[];
  /** Number of volume samples (same as volumes.length) */
  sliceLength: number;
}

// ─── Service ─────────────────────────────────────────────────────

class TTSService {
  private useProxy = true;
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
      const volumes = await this.extractVolumes(arrayBuffer);

      return {
        audioBase64: base64,
        volumes,
        sliceLength: volumes.length,
      };
    } catch (err) {
      console.error('[TTSService] Synthesis failed:', err);

      // If direct API fails, try proxy
      if (!this.useProxy) {
        if (import.meta.env.DEV) console.log('[TTSService] Switching to proxy...');
        this.useProxy = true;
        return this.synthesize(text);
      }

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

  // ── Private ────────────────────────────────────────────────────

  private async callFishAudio(text: string): Promise<Blob | null> {
    const url = this.useProxy ? FISH_TTS_PROXY : FISH_TTS_API;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FISH_TTS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference_id: FISH_TTS_REFERENCE_ID,
        format: 'mp3',
        latency: 'normal',
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Fish Audio API error ${response.status}: ${errText}`);
    }

    return response.blob();
  }

  private async extractVolumes(arrayBuffer: ArrayBuffer): Promise<number[]> {
    try {
      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      return this.computeVolumes(audioBuffer);
    } catch (err) {
      console.warn('[TTSService] Volume extraction failed, using empty volumes:', err);
      return [];
    }
  }

  private computeVolumes(audioBuffer: AudioBuffer, fps = 30): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerFrame = Math.floor(audioBuffer.sampleRate / fps);
    const volumes: number[] = [];

    for (let i = 0; i < channelData.length; i += samplesPerFrame) {
      const end = Math.min(i + samplesPerFrame, channelData.length);
      let sumSquares = 0;
      for (let j = i; j < end; j++) {
        sumSquares += channelData[j] * channelData[j];
      }
      const rms = Math.sqrt(sumSquares / (end - i));
      // Normalize to 0-1 range with some amplification for lip sync visibility
      volumes.push(Math.min(rms * 5, 1));
    }

    return volumes;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/** Singleton instance */
export const ttsService = new TTSService();
