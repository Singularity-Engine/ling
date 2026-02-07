import { memo, useMemo } from 'react';
import { useToolState, ToolCategory } from '../../context/tool-state-context';

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: '#60a5fa',
  code: '#10b981',
  memory: '#a78bfa',
  weather: '#facc15',
  generic: '#8b5cf6',
};

/**
 * BackgroundReactor — full-screen radial gradient overlay that subtly
 * responds to the current tool-state phase & dominant category.
 *
 * Layers (bottom → top):
 *  - Large soft radial glow centred on the model (50%, 40%)
 *  - Vignette that darkens edges when tools are active
 */
export const BackgroundReactor = memo(() => {
  const { currentPhase, dominantCategory } = useToolState();
  const isActive = currentPhase === 'thinking' || currentPhase === 'working';
  const color = CATEGORY_COLORS[dominantCategory ?? 'generic'];

  const style = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 0.8s ease',
      opacity: isActive ? 0.35 : 0,
      background: `radial-gradient(ellipse 60% 50% at 50% 40%, ${color}22 0%, transparent 70%)`,
      willChange: 'opacity',
    }),
    [isActive, color],
  );

  return <div style={style} />;
});

BackgroundReactor.displayName = 'BackgroundReactor';
