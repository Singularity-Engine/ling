import { useTranslation } from 'react-i18next';
import { memo, useState, useEffect, useRef } from 'react';
import { useTTSState, TTSPhase } from '@/context/tts-state-context';

const keyframesStyle = `
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

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

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
        setTimeout(() => {
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
    };
  }, [phase]);

  if (!visible) return null;

  const cfg = phaseConfig[phase === 'idle' ? 'playing' : phase]; // idle fallback won't render

  const isPlaying = phase === 'playing';
  const isError = phase === 'error';

  return (
    <>
      <style>{keyframesStyle}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          background: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(12px)',
          borderRadius: '16px',
          border: `1px solid ${isError ? 'rgba(248, 113, 113, 0.3)' : 'rgba(255,255,255,0.06)'}`,
          transition: 'border-color 0.4s ease, opacity 0.4s ease',
          animation: fading ? 'ttsFadeOut 0.3s ease-out forwards' : 'ttsFadeIn 0.3s ease-out',
        }}
        title={isError && lastError ? lastError : undefined}
      >
        {/* Indicator: dot for synthesizing/error, equalizer bars for playing */}
        {isPlaying ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
            {([
              { idx: 1, baseH: 4 },
              { idx: 2, baseH: 6 },
              { idx: 3, baseH: 3 },
            ] as const).map(({ idx, baseH }) => (
              <div
                key={idx}
                style={{
                  width: '2px',
                  height: `${baseH}px`,
                  background: cfg.dotColor,
                  borderRadius: '1px',
                  willChange: 'transform',
                  animation: `ttsBarBounce${idx} ${0.6 + idx * 0.15}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: cfg.dotColor,
              boxShadow: `0 0 6px ${cfg.dotColor}88`,
              flexShrink: 0,
              animation: cfg.animate ? 'ttsPulse 1.2s ease-in-out infinite' : undefined,
            }}
          />
        )}

        {/* Label */}
        <span
          style={{
            fontSize: '11px',
            color: isError ? 'rgba(248, 113, 113, 0.9)' : 'rgba(255,255,255,0.75)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
        >
          {t(cfg.i18nKey)}
        </span>
      </div>
    </>
  );
});

TTSStatus.displayName = 'TTSStatus';
