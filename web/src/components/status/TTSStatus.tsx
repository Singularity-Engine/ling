import { useTranslation } from 'react-i18next';
import { memo, useState, useEffect, useRef, type CSSProperties } from 'react';
import { useTTSState, TTSPhase } from '@/context/tts-state-context';

// ── Module-level keyframe injection ──
const TTS_STYLE_ID = 'tts-status-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(TTS_STYLE_ID)) {
  const el = document.createElement('style');
  el.id = TTS_STYLE_ID;
  el.textContent = `
    @keyframes ttsPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    @keyframes ttsFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 0.85; transform: translateY(0); }
    }
    @keyframes ttsFadeOut {
      from { opacity: 0.85; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-4px); }
    }
    @keyframes ttsBarBounce1 {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(3); }
    }
    @keyframes ttsBarBounce2 {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(1.67); }
    }
    @keyframes ttsBarBounce3 {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(4.67); }
    }
  `;
  document.head.appendChild(el);
}

const phaseConfig: Record<Exclude<TTSPhase, 'idle'>, {
  dotColor: string;
  i18nKey: string;
  animate: boolean;
}> = {
  synthesizing: {
    dotColor: '#a78bfa',
    i18nKey: 'tts.synthesizing',
    animate: true,
  },
  playing: {
    dotColor: 'var(--ling-success)',
    i18nKey: 'tts.playing',
    animate: false,
  },
  error: {
    dotColor: 'var(--ling-error)',
    i18nKey: 'tts.error',
    animate: false,
  },
};

// ── Pre-allocated style constants — eliminate per-render allocations ──
const S_CONTAINER_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 10px',
  background: 'rgba(0, 0, 0, 0.35)',
  backdropFilter: 'blur(12px)',
  borderRadius: '16px',
  transition: 'border-color 0.4s ease, opacity 0.4s ease',
};

const S_CONTAINER_NORMAL: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: '1px solid rgba(255,255,255,0.06)',
};

const S_CONTAINER_ERROR: CSSProperties = {
  ...S_CONTAINER_BASE,
  border: '1px solid rgba(248, 113, 113, 0.3)',
};

const S_EQ_WRAP: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  height: '14px',
};

const S_DOT_BASE: CSSProperties = {
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  flexShrink: 0,
};

const S_LABEL_NORMAL: CSSProperties = {
  fontSize: '11px',
  color: 'rgba(255,255,255,0.75)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  lineHeight: 1,
};

const S_LABEL_ERROR: CSSProperties = {
  fontSize: '11px',
  color: 'rgba(248, 113, 113, 0.9)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  lineHeight: 1,
};

// Pre-computed equalizer bar configs with their static style portions
const EQ_BARS = [
  { key: 1, baseH: 4, style: (color: string): CSSProperties => ({ width: '2px', height: '4px', background: color, borderRadius: '1px', willChange: 'transform', animation: 'ttsBarBounce1 0.75s ease-in-out infinite' }) },
  { key: 2, baseH: 6, style: (color: string): CSSProperties => ({ width: '2px', height: '6px', background: color, borderRadius: '1px', willChange: 'transform', animation: 'ttsBarBounce2 0.9s ease-in-out infinite' }) },
  { key: 3, baseH: 3, style: (color: string): CSSProperties => ({ width: '2px', height: '3px', background: color, borderRadius: '1px', willChange: 'transform', animation: 'ttsBarBounce3 1.05s ease-in-out infinite' }) },
] as const;

/**
 * Minimal TTS status indicator.
 * - Synthesizing: pulsing purple dot + "语音生成中..."
 * - Playing: green equalizer bars
 * - Error: red dot + "语音生成失败" (auto-fades after 3s)
 * - Idle: hidden
 */
export const TTSStatus = memo(() => {
  const { phase, lastError } = useTTSState();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    if (phase === 'idle') {
      // fade out
      if (visible) {
        setFading(true);
        timerRef.current = setTimeout(() => {
          setVisible(false);
          setFading(false);
        }, 300);
      }
    } else if (phase === 'error') {
      setVisible(true);
      setFading(false);
      // auto-hide error after 3s
      timerRef.current = setTimeout(() => {
        setFading(true);
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false);
          setFading(false);
        }, 300);
      }, 3000);
    } else {
      setVisible(true);
      setFading(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [phase]);

  if (!visible) return null;

  const cfg = phaseConfig[phase === 'idle' ? 'playing' : phase]; // idle fallback won't render

  const isPlaying = phase === 'playing';
  const isError = phase === 'error';

  const containerStyle = isError ? S_CONTAINER_ERROR : S_CONTAINER_NORMAL;
  const animation = fading ? 'ttsFadeOut 0.3s ease-out forwards' : 'ttsFadeIn 0.3s ease-out';

  return (
    <div
      style={{ ...containerStyle, animation }}
      title={isError && lastError ? lastError : undefined}
    >
      {/* Indicator: dot for synthesizing/error, equalizer bars for playing */}
      {isPlaying ? (
        <div style={S_EQ_WRAP}>
          {EQ_BARS.map(bar => (
            <div key={bar.key} style={bar.style(cfg.dotColor)} />
          ))}
        </div>
      ) : (
        <div
          style={{
            ...S_DOT_BASE,
            background: cfg.dotColor,
            boxShadow: `0 0 6px ${cfg.dotColor}88`,
            animation: cfg.animate ? 'ttsPulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
      )}

      {/* Label */}
      <span style={isError ? S_LABEL_ERROR : S_LABEL_NORMAL}>
        {t(cfg.i18nKey)}
      </span>
    </div>
  );
});

TTSStatus.displayName = 'TTSStatus';
