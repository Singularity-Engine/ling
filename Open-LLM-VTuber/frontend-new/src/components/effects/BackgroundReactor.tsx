import { memo, useMemo } from 'react';
import { useToolState } from '../../context/tool-state-context';
import { useAiState } from '../../context/ai-state-context';

// Stage-specific colors: thinking=blue, working=cyan, presenting=gold, ai-thinking=purple
const PHASE_COLORS = {
  thinking: '#60a5fa',
  working: '#22d3ee',
  presenting: '#fbbf24',
  idle: '#8b5cf6',
  aiThinking: '#a78bfa',
} as const;

export const BackgroundReactor = memo(() => {
  const { currentPhase } = useToolState();
  const { isThinkingSpeaking } = useAiState();
  const isThinking = currentPhase === 'thinking';
  const isWorking = currentPhase === 'working';
  const isToolActive = isThinking || isWorking;
  const isPresenting = currentPhase === 'presenting';
  // AI thinking/speaking without tool calls — softer ambient glow
  const isAiThinking = isThinkingSpeaking && !isToolActive && !isPresenting;
  const isActive = isToolActive || isAiThinking;

  const phaseColor = isThinking
    ? PHASE_COLORS.thinking
    : isWorking
      ? PHASE_COLORS.working
      : isPresenting
        ? PHASE_COLORS.presenting
        : isAiThinking
          ? PHASE_COLORS.aiThinking
          : PHASE_COLORS.idle;

  // Phase-specific animation names
  const activeAnimation = isThinking
    ? 'bgThinkingPulse'
    : isWorking
      ? 'bgWorkingFlow'
      : isAiThinking
        ? 'bgAiThinkingBreathe'
        : 'none';

  const glowStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 0.8s ease',
      opacity: isActive ? (isAiThinking ? 0.45 : 0.6) : isPresenting ? 0.7 : 0,
      background: isPresenting
        ? `radial-gradient(ellipse 80% 70% at 50% 40%, ${phaseColor}66 0%, ${phaseColor}33 35%, ${phaseColor}11 60%, transparent 80%)`
        : isAiThinking
          ? `radial-gradient(ellipse 60% 50% at 50% 40%, ${phaseColor}33 0%, ${phaseColor}15 40%, transparent 65%)`
          : isWorking
            ? `radial-gradient(ellipse 70% 60% at 50% 40%, ${phaseColor}55 0%, ${phaseColor}22 40%, transparent 75%)`
            : `radial-gradient(ellipse 65% 55% at 50% 40%, ${phaseColor}44 0%, ${phaseColor}1a 45%, transparent 70%)`,
      willChange: 'opacity',
      animation: isActive ? `${activeAnimation} ${isAiThinking ? '4s' : '3s'} ease-in-out infinite` : 'none',
    }),
    [isActive, isPresenting, isWorking, isAiThinking, phaseColor, activeAnimation],
  );

  // Secondary ambient layer for depth
  const ambientStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 1s ease',
      opacity: isActive ? (isAiThinking ? 0.25 : 0.4) : isPresenting ? 0.5 : 0,
      background: isAiThinking
        ? `radial-gradient(ellipse 50% 40% at 50% 38%, ${phaseColor}1a 0%, transparent 55%)`
        : isWorking
          ? `conic-gradient(from 0deg at 50% 40%, transparent 0deg, ${phaseColor}22 90deg, transparent 180deg, ${phaseColor}22 270deg, transparent 360deg)`
          : isPresenting
            ? `radial-gradient(ellipse 60% 50% at 50% 35%, ${phaseColor}44 0%, transparent 60%)`
            : 'none',
      animation: isWorking
        ? 'bgWorkingSpin 8s linear infinite'
        : isPresenting
          ? 'bgPresentingRays 2s ease-out forwards'
          : 'none',
    }),
    [isActive, isPresenting, isWorking, isAiThinking, phaseColor],
  );

  const vignetteStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 1s ease',
      opacity: isActive || isPresenting ? 0.5 : 0,
      background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.3) 100%)',
    }),
    [isActive, isPresenting],
  );

  return (
    <>
      <style>{`
        @keyframes bgThinkingPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.7; }
        }
        @keyframes bgWorkingFlow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }
        @keyframes bgAiThinkingBreathe {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.01); }
        }
        @keyframes bgWorkingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bgPresentingRays {
          0% { opacity: 0; transform: scale(0.8); }
          30% { opacity: 0.6; transform: scale(1.05); }
          100% { opacity: 0.3; transform: scale(1.2); }
        }
        @keyframes completionBloom {
          0% { opacity: 0; transform: scale(0.5); }
          20% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        @keyframes completionFlash {
          0% { opacity: 0; }
          15% { opacity: 0.8; }
          100% { opacity: 0; }
        }
      `}</style>
      <div style={glowStyle} />
      <div style={ambientStyle} />
      <div style={vignetteStyle} />
      {/* Presenting: gold bloom burst + flash */}
      {isPresenting && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: '-10%',
              pointerEvents: 'none',
              borderRadius: '50%',
              background: `radial-gradient(ellipse 50% 45% at 50% 40%, ${phaseColor}55 0%, ${phaseColor}22 40%, transparent 65%)`,
              animation: 'completionBloom 1.5s ease-out forwards',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: `radial-gradient(ellipse 50% 40% at 50% 40%, ${phaseColor}66 0%, transparent 60%)`,
              animation: 'completionFlash 1s ease-out forwards',
            }}
          />
        </>
      )}
    </>
  );
});

BackgroundReactor.displayName = 'BackgroundReactor';
