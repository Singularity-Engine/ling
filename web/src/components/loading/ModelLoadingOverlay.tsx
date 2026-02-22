import type { CSSProperties } from 'react';
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLive2DConfig } from '@/context/live2d-config-context';
import { useWebSocket } from '@/context/websocket-context';

// --- Module-level style constants ---

const S_OVERLAY_BASE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 12,
  background: 'rgba(10, 0, 21, 0.92)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
};

const S_OVERLAY_LOADING: CSSProperties = { ...S_OVERLAY_BASE, opacity: 1, pointerEvents: 'auto' as const };
const S_OVERLAY_READY: CSSProperties = { ...S_OVERLAY_BASE, opacity: 0, pointerEvents: 'none' as const };

const S_GLOW_RING: CSSProperties = {
  position: 'relative',
  width: 140,
  height: 140,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const S_PARTICLE_RING: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  border: '1px solid rgba(139, 92, 246, 0.15)',
  animation: 'modelLoadRingSpin 8s linear infinite',
};

const S_ORBITING_DOT: CSSProperties = {
  position: 'absolute',
  top: -3,
  left: '50%',
  marginLeft: -3,
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'rgba(139, 92, 246, 0.8)',
  boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(139, 92, 246, 0.3)',
};

const S_INNER_RING: CSSProperties = {
  position: 'absolute',
  inset: 16,
  borderRadius: '50%',
  border: '1px solid rgba(167, 139, 250, 0.1)',
  animation: 'modelLoadRingSpin 6s linear infinite reverse',
};

const S_INNER_DOT: CSSProperties = {
  position: 'absolute',
  bottom: -2,
  left: '50%',
  marginLeft: -2,
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: 'rgba(167, 139, 250, 0.6)',
  boxShadow: '0 0 8px rgba(167, 139, 250, 0.4)',
};

const S_GLYPH: CSSProperties = {
  fontSize: 36,
  fontWeight: 300,
  color: 'rgba(196, 181, 253, 0.9)',
  animation: 'modelLoadBreathe 3s ease-in-out infinite',
  textShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.15)',
  userSelect: 'none',
  letterSpacing: '0.05em',
};

const S_STATUS_CONTAINER: CSSProperties = {
  marginTop: 28,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
};

const S_STATUS_TEXT: CSSProperties = {
  fontSize: 13,
  color: 'rgba(196, 181, 253, 0.7)',
  letterSpacing: '0.12em',
  animation: 'modelLoadTextFade 2s ease-in-out infinite',
};

const S_DOTS_CONTAINER: CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 4,
};

// Pre-allocate the 3 dot styles (each has a different animation-delay)
const S_DOTS: CSSProperties[] = [0, 1, 2].map((i) => ({
  width: 3,
  height: 3,
  borderRadius: '50%',
  background: 'rgba(139, 92, 246, 0.6)',
  animation: `modelLoadDot 1.4s ease-in-out ${i * 0.2}s infinite`,
}));

// Inject keyframes once at module level
if (typeof document !== 'undefined') {
  const id = 'model-loading-overlay-keyframes';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes modelLoadRingSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes modelLoadBreathe {
        0%, 100% { transform: scale(0.95); opacity: 0.7; }
        50% { transform: scale(1.05); opacity: 1; }
      }
      @keyframes modelLoadTextFade {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.9; }
      }
      @keyframes modelLoadDot {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.3); }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Branded loading overlay shown while Live2D model is loading.
 * Displays an elegant "灵" glyph breathing animation instead of a spinner.
 * Sits above the Live2D canvas layer and fades out once model + WS are ready.
 */
export const ModelLoadingOverlay = memo(function ModelLoadingOverlay() {
  const { t } = useTranslation();
  const { modelInfo } = useLive2DConfig();
  const { wsState } = useWebSocket();

  const isReady = wsState === 'OPEN' && !!modelInfo?.url;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (isReady) {
      // Give Live2D a moment to render its first frame
      const timer = setTimeout(() => setVisible(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!visible) return null;

  return (
    <div style={isReady ? S_OVERLAY_READY : S_OVERLAY_LOADING}>
      {/* Outer glow ring */}
      <div style={S_GLOW_RING}>
        {/* Orbiting particle ring */}
        <div style={S_PARTICLE_RING}>
          {/* Orbiting dot */}
          <div style={S_ORBITING_DOT} />
        </div>

        {/* Second ring, counter-rotating */}
        <div style={S_INNER_RING}>
          <div style={S_INNER_DOT} />
        </div>

        {/* Central glyph — "灵" */}
        <div style={S_GLYPH}>{t('loading.glyph')}</div>
      </div>

      {/* Status text */}
      <div style={S_STATUS_CONTAINER}>
        <span style={S_STATUS_TEXT}>{t('loading.awakening')}</span>
        <div style={S_DOTS_CONTAINER}>
          {S_DOTS.map((dotStyle, i) => (
            <div key={i} style={dotStyle} />
          ))}
        </div>
      </div>
    </div>
  );
});
