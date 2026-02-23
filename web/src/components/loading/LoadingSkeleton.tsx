import type { CSSProperties } from 'react';
import { useState, useEffect, memo } from 'react';
import { useAiStateRead, AiStateEnum } from '@/context/ai-state-context';

// ── Timing ──
const FADE_OUT_MS = 600; // unmount delay after fade-out animation ends

// --- Module-level style constants ---

const S_OVERLAY_BASE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 15,
  background: 'var(--ling-bg-deep)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'opacity 0.5s ease-out',
};

const S_OVERLAY_LOADING: CSSProperties = { ...S_OVERLAY_BASE, opacity: 1, pointerEvents: 'auto' as const };
const S_OVERLAY_FADING: CSSProperties = { ...S_OVERLAY_BASE, opacity: 0, pointerEvents: 'none' as const };

const S_ORB: CSSProperties = {
  width: 120,
  height: 120,
  borderRadius: '50%',
  background: 'radial-gradient(circle, var(--ling-purple-30) 0%, var(--ling-purple-05) 70%, transparent 100%)',
  animation: 'skeletonOrb 2s ease-in-out infinite',
  willChange: 'transform, opacity',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 32,
};

const S_ORB_INNER: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'var(--ling-purple-20)',
  animation: 'skeletonPulse 1.5s ease-in-out infinite',
};

const S_TEXT_LINES: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  alignItems: 'center',
};

const S_BOTTOM_BAR_CONTAINER: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  padding: '12px 16px',
  borderTop: '1px solid var(--ling-purple-08)',
};

const S_BOTTOM_BAR: CSSProperties = {
  height: 44,
  borderRadius: 22,
  background: 'var(--ling-surface)',
  border: '1px solid var(--ling-surface-border)',
  animation: 'skeletonPulse 1.5s ease-in-out infinite',
  overflow: 'hidden',
  position: 'relative',
};

const S_BOTTOM_BAR_SHIMMER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(90deg, transparent, var(--ling-purple-05), transparent)',
  animation: 'skeletonBarShimmer 2s ease-in-out infinite',
};

// Pre-allocate SkeletonBar styles for the two fixed instances
const S_SKELETON_BAR_OUTER_0: CSSProperties = {
  width: 140,
  height: 10,
  borderRadius: 5,
  background: 'var(--ling-surface)',
  animation: 'skeletonPulse 1.5s ease-in-out 0s infinite',
  overflow: 'hidden',
  position: 'relative',
};

const S_SKELETON_BAR_SHIMMER_0: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(90deg, transparent, var(--ling-purple-08), transparent)',
  animation: 'skeletonBarShimmer 2s ease-in-out 0s infinite',
};

const S_SKELETON_BAR_OUTER_1: CSSProperties = {
  width: 100,
  height: 10,
  borderRadius: 5,
  background: 'var(--ling-surface)',
  animation: 'skeletonPulse 1.5s ease-in-out 0.15s infinite',
  overflow: 'hidden',
  position: 'relative',
};

const S_SKELETON_BAR_SHIMMER_1: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(90deg, transparent, var(--ling-purple-08), transparent)',
  animation: 'skeletonBarShimmer 2s ease-in-out 0.15s infinite',
};

/**
 * Full-screen skeleton overlay shown while the app initializes.
 * Fades out gracefully once aiState leaves LOADING.
 */
export const LoadingSkeleton = memo(function LoadingSkeleton() {
  const { aiState } = useAiStateRead();
  const isLoading = aiState === AiStateEnum.LOADING;
  const [visible, setVisible] = useState(true);

  // Once loading completes, start fade-out, then unmount
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setVisible(false), FADE_OUT_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div
      style={isLoading ? S_OVERLAY_LOADING : S_OVERLAY_FADING}
      role="status"
      aria-busy={isLoading}
      aria-label={isLoading ? '加载中' : undefined}
    >
      {/* Central pulsing orb — avatar placeholder */}
      <div style={S_ORB} aria-hidden="true">
        <div style={S_ORB_INNER} />
      </div>

      {/* Skeleton text lines */}
      <div style={S_TEXT_LINES} aria-hidden="true">
        <div style={S_SKELETON_BAR_OUTER_0}>
          <div style={S_SKELETON_BAR_SHIMMER_0} />
        </div>
        <div style={S_SKELETON_BAR_OUTER_1}>
          <div style={S_SKELETON_BAR_SHIMMER_1} />
        </div>
      </div>

      {/* Bottom bar skeleton — mimics InputBar */}
      <div style={S_BOTTOM_BAR_CONTAINER} aria-hidden="true">
        <div style={S_BOTTOM_BAR}>
          <div style={S_BOTTOM_BAR_SHIMMER} />
        </div>
      </div>
    </div>
  );
});
