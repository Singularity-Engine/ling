import { memo, useMemo, useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import { audioManager } from '../../utils/audio-manager';
import { createLogger } from '@/utils/logger';

const log = createLogger('AudioViz');

const BAR_COUNT = 32;
const FFT_SIZE = 128;
const SMOOTHING = 0.82;
const MIN_DB = -90;
const MAX_DB = -20;

// ── Module-level style constants (avoid object allocation on every render) ──
const CONTAINER_STYLE_BASE: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(420px, 60vw)',
  height: '48px',
  transition: 'opacity 0.4s ease',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 0 12px rgba(139, 92, 246, 0.3))',
};

const CANVAS_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

/**
 * Lightweight audio spectrum visualizer that activates during TTS playback.
 * Connects to the HTMLAudioElement via AudioContext + AnalyserNode for
 * real-time frequency data, rendered as translucent gradient bars.
 */
export const AudioVisualizer = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(false);

  // Decay buffer for smooth falloff
  const decayRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    // Disconnect source but DON'T close AudioContext (reuse it)
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* noop */ }
      sourceRef.current = null;
    }
    connectedAudioRef.current = null;
    analyserRef.current = null;
    decayRef.current.fill(0);
    setActive(false);
  }, []);

  useEffect(() => {
    const unsubscribe = audioManager.onAudioChange((audio) => {
      // Clean up previous connection
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch { /* noop */ }
        sourceRef.current = null;
      }
      connectedAudioRef.current = null;
      analyserRef.current = null;

      if (!audio) {
        // No audio playing — let decay animation finish, then deactivate
        // We keep the RAF running briefly so bars decay to zero
        return;
      }

      try {
        // Reuse or create AudioContext
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = SMOOTHING;
        analyser.minDecibels = MIN_DB;
        analyser.maxDecibels = MAX_DB;

        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        sourceRef.current = source;
        analyserRef.current = analyser;
        connectedAudioRef.current = audio;
        setActive(true);
      } catch (e) {
        log.error('Failed to connect analyser:', e);
      }
    });

    return () => {
      unsubscribe();
      cleanup();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* noop */ }
        audioCtxRef.current = null;
      }
    };
  }, [cleanup]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const dataArray = new Uint8Array(FFT_SIZE / 2);
    const decay = decayRef.current;

    let lastTime = 0;
    const FRAME_INTERVAL = 1000 / 30; // Cap at 30fps to stay lightweight

    const draw = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(draw);

      if (timestamp - lastTime < FRAME_INTERVAL) return;
      lastTime = timestamp;

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      }

      const binCount = dataArray.length;
      const barWidth = Math.floor(w / BAR_COUNT);
      const gap = 2;
      const effectiveBarWidth = barWidth - gap;
      const startX = Math.floor((w - BAR_COUNT * barWidth) / 2);

      let hasEnergy = false;

      // One shared gradient per frame instead of 32 per-bar allocations.
      // Per-bar opacity is controlled via globalAlpha (see below).
      const sharedGradient = ctx2d.createLinearGradient(0, h, 0, 0);
      sharedGradient.addColorStop(0, 'rgba(139, 92, 246, 0.75)');
      sharedGradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.6)');
      sharedGradient.addColorStop(1, 'rgba(96, 165, 250, 0.45)');
      ctx2d.fillStyle = sharedGradient;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Map bar index to frequency bin range (weighted toward lower frequencies)
        const ratio = i / BAR_COUNT;
        const binIndex = Math.min(
          Math.floor(ratio * ratio * binCount * 0.8),
          binCount - 1
        );

        // Average a few neighboring bins for smoother look
        let sum = 0;
        let count = 0;
        for (let b = Math.max(0, binIndex - 1); b <= Math.min(binCount - 1, binIndex + 1); b++) {
          sum += dataArray[b];
          count++;
        }
        const raw = (sum / count) / 255;

        // Apply decay for smooth falloff
        const target = raw;
        if (target > decay[i]) {
          decay[i] = target; // instant attack
        } else {
          decay[i] += (target - decay[i]) * 0.15; // slow decay
        }

        const val = decay[i];
        if (val > 0.01) hasEnergy = true;

        const barHeight = Math.max(2, val * h * 0.85);
        const x = startX + i * barWidth;
        const y = h - barHeight;

        ctx2d.globalAlpha = val;
        ctx2d.beginPath();
        const radius = Math.min(effectiveBarWidth / 2, 3);
        // Rounded top rectangle
        ctx2d.moveTo(x + radius, y);
        ctx2d.lineTo(x + effectiveBarWidth - radius, y);
        ctx2d.quadraticCurveTo(x + effectiveBarWidth, y, x + effectiveBarWidth, y + radius);
        ctx2d.lineTo(x + effectiveBarWidth, h);
        ctx2d.lineTo(x, h);
        ctx2d.lineTo(x, y + radius);
        ctx2d.quadraticCurveTo(x, y, x + radius, y);
        ctx2d.fill();
      }
      ctx2d.globalAlpha = 1;

      // If no analyser and no energy left, deactivate
      if (!analyser && !hasEnergy) {
        setActive(false);
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.scale(dpr, dpr);
    };
    resize();
    let resizeRaf = 0;
    const throttledResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
    };
    window.addEventListener('resize', throttledResize);
    return () => {
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', throttledResize);
    };
  }, []);

  const containerStyle = useMemo(
    () => ({ ...CONTAINER_STYLE_BASE, opacity: active ? 1 : 0 }),
    [active],
  );

  return (
    <div style={containerStyle}>
      <canvas ref={canvasRef} style={CANVAS_STYLE} />
    </div>
  );
});

AudioVisualizer.displayName = 'AudioVisualizer';
