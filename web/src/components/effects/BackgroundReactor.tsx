import { memo, useMemo, useRef, useState, useEffect, type CSSProperties } from 'react';
import { useToolState } from '../../context/tool-state-context';
import { useAiStateRead } from '../../context/ai-state-context';
import { useAffinityState } from '../../context/affinity-context';
import { AFFINITY_AMBIENT_TINTS, DEFAULT_LEVEL, type AffinityAmbientTint } from '../../config/affinity-palette';
import { createStyleInjector } from '@/utils/style-injection';

// ── Deferred style injection (avoids module-level side effects) ──
const ensureBgReactorStyles = createStyleInjector({
  id: 'bg-reactor-keyframes',
  css: `
    @keyframes bgThinkingPulse {
      0%, 100% { opacity: calc(0.5 * var(--bg-glow-boost, 1)); }
      50% { opacity: calc(0.7 * var(--bg-glow-boost, 1)); }
    }
    @keyframes bgWorkingFlow {
      0%, 100% { opacity: calc(0.55 * var(--bg-glow-boost, 1)); transform: scale(1); }
      50% { opacity: calc(0.7 * var(--bg-glow-boost, 1)); transform: scale(1.02); }
    }
    @keyframes bgAiThinkingBreathe {
      0%, 100% { opacity: calc(0.35 * var(--bg-glow-boost, 1)); transform: scale(1); }
      50% { opacity: calc(0.5 * var(--bg-glow-boost, 1)); transform: scale(1.01); }
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
    @keyframes bgAffinityBreathe {
      0%, 100% { opacity: var(--affinity-idle-opacity, 0.1); }
      50% { opacity: calc(var(--affinity-idle-opacity, 0.1) * var(--affinity-breathe-amp, 1.6)); }
    }
    @keyframes bgGainPulse {
      0% { opacity: 0; transform: scale(0.85); }
      25% { opacity: 0.4; transform: scale(1); }
      100% { opacity: 0; transform: scale(1.08); }
    }
    @keyframes bgLevelBloom {
      0% { opacity: 0; transform: scale(0.6); }
      20% { opacity: 0.65; transform: scale(1); }
      55% { opacity: 0.3; transform: scale(1.15); }
      100% { opacity: 0; transform: scale(1.3); }
    }
  `,
});

// Stage-specific colors: thinking=blue, working=cyan, presenting=gold, ai-thinking=purple
const PHASE_COLORS = {
  thinking: '#60a5fa',
  working: '#22d3ee',
  presenting: '#fbbf24',
  idle: '#8b5cf6',
  aiThinking: '#a78bfa',
} as const;

const DEFAULT_TINT: AffinityAmbientTint = AFFINITY_AMBIENT_TINTS[DEFAULT_LEVEL];

// ── Module-level base styles for one-shot animation overlays ──
// Static properties are hoisted here; dynamic `background` is merged via useMemo.
const BLOOM_BURST_BASE: CSSProperties = {
  position: 'absolute',
  inset: '-10%',
  pointerEvents: 'none',
  borderRadius: '50%',
  animation: 'completionBloom 1.5s ease-out forwards',
};

const FLASH_BASE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: 'completionFlash 1s ease-out forwards',
};

const GAIN_PULSE_BASE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: 'bgGainPulse 1.2s ease-out forwards',
  willChange: 'opacity, transform',
};

const LEVEL_BLOOM_BASE: CSSProperties = {
  position: 'absolute',
  inset: '-5%',
  pointerEvents: 'none',
  borderRadius: '50%',
  animation: 'bgLevelBloom 1.8s ease-out forwards',
  willChange: 'opacity, transform',
};

export const BackgroundReactor = memo(() => {
  useEffect(ensureBgReactorStyles, []);
  const { currentPhase } = useToolState();
  const { isThinkingSpeaking } = useAiStateRead();
  const { level, pointGains, expressionIntensity } = useAffinityState();
  const tint = AFFINITY_AMBIENT_TINTS[level] || DEFAULT_TINT;

  // ── Level transition detection ─────────────────────────────────
  const prevLevelRef = useRef(level);
  const [levelTransition, setLevelTransition] = useState<{
    key: number;
    color: string;
  } | null>(null);
  const transitionKeyRef = useRef(0);

  useEffect(() => {
    if (prevLevelRef.current !== level) {
      prevLevelRef.current = level;
      transitionKeyRef.current++;
      setLevelTransition({ key: transitionKeyRef.current, color: tint.color });
      const timer = setTimeout(() => setLevelTransition(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [level, tint.color]);

  // ── Point gain pulse ───────────────────────────────────────────
  const latestGain = pointGains.length > 0 ? pointGains[pointGains.length - 1] : null;
  const gainPulseColor = latestGain && latestGain.delta > 0 ? tint.color : '#ef4444';

  const isThinking = currentPhase === 'thinking';
  const isWorking = currentPhase === 'working';
  const isToolActive = isThinking || isWorking;
  const isPresenting = currentPhase === 'presenting';
  // AI thinking/speaking without tool calls — softer ambient glow
  const isAiThinking = isThinkingSpeaking && !isToolActive && !isPresenting;
  const isActive = isToolActive || isAiThinking;

  // Emotion intensity boost: when Gateway sends emotion-expression with high
  // intensity, amplify the active glow and speed up affinity breathing.
  // Range: 0 → no extra boost, 1 → +40% glow opacity, 30% faster breathing
  const emotionBoost = 1 + expressionIntensity * 0.4;

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
      // Expose boost multiplier as CSS variable so keyframe animations
      // (bgThinkingPulse, bgWorkingFlow, bgAiThinkingBreathe) can scale
      // their hardcoded opacity values by emotionBoost × activeBoost.
      '--bg-glow-boost': tint.activeBoost * emotionBoost,
      opacity: isActive
        ? (isAiThinking ? 0.45 : 0.6) * tint.activeBoost * emotionBoost
        : isPresenting
          ? 0.7 * tint.activeBoost * emotionBoost
          : 0,
      background: isPresenting
        ? `radial-gradient(ellipse 80% 70% at 50% 40%, ${phaseColor}66 0%, ${phaseColor}33 35%, ${phaseColor}11 60%, transparent 80%)`
        : isAiThinking
          ? `radial-gradient(ellipse 60% 50% at 50% 40%, ${phaseColor}33 0%, ${phaseColor}15 40%, transparent 65%)`
          : isWorking
            ? `radial-gradient(ellipse 70% 60% at 50% 40%, ${phaseColor}55 0%, ${phaseColor}22 40%, transparent 75%)`
            : `radial-gradient(ellipse 65% 55% at 50% 40%, ${phaseColor}44 0%, ${phaseColor}1a 45%, transparent 70%)`,
      willChange: (isActive || isPresenting) ? 'opacity' : 'auto',
      animation: isActive ? `${activeAnimation} ${isAiThinking ? '4s' : '3s'} ease-in-out infinite` : 'none',
    }),
    [isActive, isPresenting, isWorking, isAiThinking, phaseColor, activeAnimation, tint.activeBoost, emotionBoost],
  );

  // Secondary ambient layer for depth
  const ambientStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 1s ease',
      // Use 0 opacity during thinking-only phase so that when working starts,
      // the conic-gradient fades in smoothly (CSS can't transition between gradients).
      opacity: isWorking ? 0.4 : isAiThinking ? 0.25 : isPresenting ? 0.5 : 0,
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
      willChange: (isWorking || isPresenting || isAiThinking) ? 'opacity, transform' : 'auto',
    }),
    [isPresenting, isWorking, isAiThinking, phaseColor],
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

  // Affinity-level ambient tint: always-on subtle glow for non-neutral levels
  // hatred/hostile = warm danger tint, close/devoted = warm pink/purple glow
  // Note: CSS cannot transition between radial-gradient() values, so we use
  // background-color (which CAN transition) + mask-image for the gradient shape.
  const tintMask = useMemo(
    () => `radial-gradient(ellipse ${tint.gradientSpread} at 50% 45%, rgba(0,0,0,0.267) 0%, rgba(0,0,0,0.094) 40%, transparent 70%)`,
    [tint.gradientSpread],
  );
  const affinityTintStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      transition: 'opacity 1.5s ease, background-color 1.5s ease',
      opacity: tint.idleOpacity,
      backgroundColor: tint.color,
      WebkitMaskImage: tintMask,
      maskImage: tintMask,
      // Split animation into individual properties so that when only
      // expressionIntensity changes, the browser adjusts duration without
      // restarting the animation (shorthand changes cause restart).
      animationName: tint.idleOpacity > 0 ? 'bgAffinityBreathe' : 'none',
      animationDuration: `${tint.breatheSpeed * (1 / (1 + expressionIntensity * 0.3))}s`,
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite' as const,
      // CSS custom properties consumed by bgAffinityBreathe keyframes —
      // folded into the memo to avoid an inline spread that defeats memoization.
      '--affinity-idle-opacity': tint.idleOpacity,
      '--affinity-breathe-amp': tint.breatheAmplitude,
    }),
    [tint.color, tint.idleOpacity, tint.breatheSpeed, tint.breatheAmplitude, tintMask, expressionIntensity],
  );

  // Memoized styles for one-shot animation overlays — only recompute when
  // their dynamic gradient color changes, not on every parent re-render.
  const bloomBurstStyle = useMemo(
    () => ({ ...BLOOM_BURST_BASE, background: `radial-gradient(ellipse 50% 45% at 50% 40%, ${phaseColor}55 0%, ${phaseColor}22 40%, transparent 65%)` }),
    [phaseColor],
  );
  const flashStyle = useMemo(
    () => ({ ...FLASH_BASE, background: `radial-gradient(ellipse 50% 40% at 50% 40%, ${phaseColor}66 0%, transparent 60%)` }),
    [phaseColor],
  );
  const gainPulseStyle = useMemo(
    () => ({ ...GAIN_PULSE_BASE, background: `radial-gradient(ellipse 55% 45% at 50% 45%, ${gainPulseColor}40 0%, ${gainPulseColor}15 40%, transparent 65%)` }),
    [gainPulseColor],
  );
  const levelBloomStyle = useMemo(
    () => ({ ...LEVEL_BLOOM_BASE, background: `radial-gradient(ellipse 50% 45% at 50% 45%, ${levelTransition?.color}55 0%, ${levelTransition?.color}22 40%, transparent 65%)` }),
    [levelTransition?.color],
  );

  return (
    <>
      {/* Keyframes injected at module level — no inline <style> needed */}
      <div style={glowStyle as CSSProperties} />
      <div style={ambientStyle} />
      <div style={vignetteStyle} />
      <div style={affinityTintStyle as CSSProperties} />
      {/* Presenting: gold bloom burst + flash */}
      {isPresenting && (
        <>
          <div style={bloomBurstStyle} />
          <div style={flashStyle} />
        </>
      )}
      {/* Affinity point-gain pulse — brief radial flash on every affinity change */}
      {latestGain && (
        <div key={latestGain.id} style={gainPulseStyle} />
      )}
      {/* Level transition bloom — dramatic flash when crossing affinity level boundary */}
      {levelTransition && (
        <div key={levelTransition.key} style={levelBloomStyle} />
      )}
    </>
  );
});

BackgroundReactor.displayName = 'BackgroundReactor';
