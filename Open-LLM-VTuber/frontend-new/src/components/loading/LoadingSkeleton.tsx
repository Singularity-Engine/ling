import { useState, useEffect, memo } from 'react';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';

/**
 * Full-screen skeleton overlay shown while the app initializes.
 * Fades out gracefully once aiState leaves LOADING.
 */
export const LoadingSkeleton = memo(function LoadingSkeleton() {
  const { aiState } = useAiState();
  const isLoading = aiState === AiStateEnum.LOADING;
  const [visible, setVisible] = useState(true);

  // Once loading completes, start fade-out, then unmount
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 15,
        background: '#0a0015',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isLoading ? 1 : 0,
        transition: 'opacity 0.5s ease-out',
        pointerEvents: isLoading ? 'auto' : 'none',
      }}
    >
      {/* Central pulsing orb — avatar placeholder */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.05) 70%, transparent 100%)',
          animation: 'skeletonOrb 2s ease-in-out infinite',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(139,92,246,0.2)',
            animation: 'skeletonPulse 1.5s ease-in-out infinite',
          }}
        />
      </div>

      {/* Skeleton text lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <SkeletonBar width={140} delay={0} />
        <SkeletonBar width={100} delay={0.15} />
      </div>

      {/* Bottom bar skeleton — mimics InputBar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          borderTop: '1px solid rgba(139,92,246,0.08)',
        }}
      >
        <div
          style={{
            height: 44,
            borderRadius: 22,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            animation: 'skeletonPulse 1.5s ease-in-out infinite',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.06), transparent)',
              animation: 'skeletonBarShimmer 2s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
});

function SkeletonBar({ width, delay }: { width: number; delay: number }) {
  return (
    <div
      style={{
        width,
        height: 10,
        borderRadius: 5,
        background: 'rgba(255,255,255,0.06)',
        animation: `skeletonPulse 1.5s ease-in-out ${delay}s infinite`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.08), transparent)',
          animation: `skeletonBarShimmer 2s ease-in-out ${delay}s infinite`,
        }}
      />
    </div>
  );
}
