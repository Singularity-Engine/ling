import { createLogger } from './logger';

const log = createLogger('AudioManager');

type AudioEventListener = (audio: HTMLAudioElement | null) => void;

/** Minimal duck-type for the Live2D model parts used by AudioManager */
interface Live2DModelLike {
  _wavFileHandler?: {
    releasePcmData(): void;
    _lastRms: number;
    _sampleOffset: number;
    _userTimeSeconds: number;
  };
}

/**
 * Global audio manager for handling audio playback and interruption
 * This ensures all components share the same audio reference
 */
class AudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentModel: Live2DModelLike | null = null;
  private listeners: Set<AudioEventListener> = new Set();

  /**
   * Subscribe to audio change events (for visualizer, etc.)
   */
  onAudioChange(listener: AudioEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners() {
    const audio = this.currentAudio;
    this.listeners.forEach(fn => fn(audio));
  }

  /**
   * Set the current playing audio
   */
  setCurrentAudio(audio: HTMLAudioElement, model: Live2DModelLike) {
    this.currentAudio = audio;
    this.currentModel = model;
    this.notifyListeners();
  }

  /**
   * Stop current audio playback and lip sync
   */
  stopCurrentAudioAndLipSync() {
    if (this.currentAudio) {
      log.debug('Stopping current audio and lip sync');
      const audio = this.currentAudio;
      
      // Stop audio playback
      audio.pause();
      audio.src = '';
      audio.load();

      // Stop Live2D lip sync
      const model = this.currentModel;
      if (model && model._wavFileHandler) {
        try {
          // Release PCM data to stop lip sync calculation in update()
          model._wavFileHandler.releasePcmData();
          log.debug('Called _wavFileHandler.releasePcmData()');

          // Additional reset of state variables as fallback
          model._wavFileHandler._lastRms = 0.0;
          model._wavFileHandler._sampleOffset = 0;
          model._wavFileHandler._userTimeSeconds = 0.0;
          log.debug('Also reset _lastRms, _sampleOffset, _userTimeSeconds as fallback');
        } catch (e) {
          log.error('Error stopping/resetting wavFileHandler:', e);
        }
      } else if (model) {
        log.warn('Current model does not have _wavFileHandler to stop/reset.');
      } else {
        log.debug('No associated model found to stop lip sync.');
      }

      // Clear references
      this.currentAudio = null;
      this.currentModel = null;
      this.notifyListeners();
    } else {
      log.debug('No current audio playing to stop.');
    }
  }

  /**
   * Clear the current audio reference (called when audio ends naturally)
   */
  clearCurrentAudio(audio: HTMLAudioElement) {
    if (this.currentAudio === audio) {
      this.currentAudio = null;
      this.currentModel = null;
      this.notifyListeners();
    }
  }

  /**
   * Check if there's currently playing audio
   */
  hasCurrentAudio(): boolean {
    return this.currentAudio !== null;
  }
}

// Export singleton instance
export const audioManager = new AudioManager();