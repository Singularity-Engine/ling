import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLive2DConfig } from '@/context/live2d-config-context';
import { useWebSocket } from '@/context/websocket-context';

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
    <div
      style={{
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
        opacity: isReady ? 0 : 1,
        transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: isReady ? 'none' : 'auto',
      }}
    >
      {/* Outer glow ring */}
      <div
        style={{
          position: 'relative',
          width: 140,
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Orbiting particle ring */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1px solid rgba(139, 92, 246, 0.15)',
            animation: 'modelLoadRingSpin 8s linear infinite',
          }}
        >
          {/* Orbiting dot */}
          <div
            style={{
              position: 'absolute',
              top: -3,
              left: '50%',
              marginLeft: -3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.8)',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(139, 92, 246, 0.3)',
            }}
          />
        </div>

        {/* Second ring, counter-rotating */}
        <div
          style={{
            position: 'absolute',
            inset: 16,
            borderRadius: '50%',
            border: '1px solid rgba(167, 139, 250, 0.1)',
            animation: 'modelLoadRingSpin 6s linear infinite reverse',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              left: '50%',
              marginLeft: -2,
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'rgba(167, 139, 250, 0.6)',
              boxShadow: '0 0 8px rgba(167, 139, 250, 0.4)',
            }}
          />
        </div>

        {/* Central glyph — "灵" */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 300,
            color: 'rgba(196, 181, 253, 0.9)',
            animation: 'modelLoadBreathe 3s ease-in-out infinite',
            textShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.15)',
            userSelect: 'none',
            letterSpacing: '0.05em',
          }}
        >
          {t('loading.glyph')}
        </div>
      </div>

      {/* Status text */}
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: 'rgba(196, 181, 253, 0.7)',
            letterSpacing: '0.12em',
            animation: 'modelLoadTextFade 2s ease-in-out infinite',
          }}
        >
          {t('loading.awakening')}
        </span>
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginTop: 4,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.6)',
                animation: `modelLoadDot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
});
