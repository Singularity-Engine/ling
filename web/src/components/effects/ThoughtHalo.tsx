import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useToolState } from '../../context/tool-state-context';
import { useAiState } from '../../context/ai-state-context';
import { useAffinity } from '../../context/affinity-context';
import { MOBILE_BREAKPOINT } from '../../constants/breakpoints';
import { AFFINITY_HALO_COLORS, CATEGORY_COLORS, DEFAULT_LEVEL } from '../../config/affinity-palette';

// ── Module-level keyframe injection (consistent with BackgroundReactor, Constellation) ──
const STYLE_ID = 'thought-halo-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes thoughtHaloRotate {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to { transform: translate(-50%, -50%) rotate(360deg); }
    }
    @keyframes thoughtHaloRotateReverse {
      from { transform: translate(-50%, -50%) rotate(360deg); }
      to { transform: translate(-50%, -50%) rotate(0deg); }
    }
    @keyframes thoughtHaloEnter {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(0deg); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
    }
    @keyframes thoughtHaloExit {
      from { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
      to { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(0deg); }
    }
    @keyframes particlePulse {
      0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.8); }
    }
    @keyframes particlePulseInner {
      0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.8); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.6); }
    }
    @keyframes ringPulse {
      0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.08); }
    }
    @keyframes innerGlowPulse {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

// Desktop / Mobile geometry
const DESKTOP = { particles: 14, innerParticles: 8, a: 60, b: 20, innerA: 42, innerB: 14 };
const MOBILE  = { particles: 8,  innerParticles: 5,  a: 40, b: 13, innerA: 28, innerB: 9  };

export const ThoughtHalo = memo(() => {
  const { currentPhase, dominantCategory } = useToolState();
  const { isThinkingSpeaking } = useAiState();
  const { level, expressionIntensity } = useAffinity();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const geo = isMobile ? MOBILE : DESKTOP;
  const isToolActive = currentPhase === 'thinking' || currentPhase === 'working';
  const isWorking = currentPhase === 'working';
  // Show a softer halo during normal AI thinking (no tool calls)
  const isAiThinking = isThinkingSpeaking && !isToolActive;
  const isActive = isToolActive || isAiThinking;

  // Track whether halo has ever been active to avoid exit-animation flicker on mount
  const hasBeenActive = useRef(false);
  if (isActive) hasBeenActive.current = true;
  const exitAnim = hasBeenActive.current ? 'thoughtHaloExit 0.3s ease-in forwards' : 'none';

  // AI thinking color now follows affinity level
  const affinityColor = AFFINITY_HALO_COLORS[level] || AFFINITY_HALO_COLORS[DEFAULT_LEVEL];
  const color = isAiThinking ? affinityColor : CATEGORY_COLORS[dominantCategory ?? 'generic'];

  // expressionIntensity speeds up rotation: 0 → normal, 1 → ~30% faster
  const emotionSpeedFactor = 1 / (1 + expressionIntensity * 0.3);
  const rotationSpeed = `${(isWorking ? 1.8 : isAiThinking ? 5 : 3) * emotionSpeedFactor}s`;
  const innerRotationSpeed = `${(isWorking ? 2.4 : isAiThinking ? 6 : 4) * emotionSpeedFactor}s`;

  // Particle sizes: ai-thinking smaller & softer, thinking 4-8px, working 6-12px
  // expressionIntensity enlarges particles up to +30%
  const emotionSizeBoost = 1 + expressionIntensity * 0.3;
  const particleMinSize = (isWorking ? 6 : isAiThinking ? 3 : 4) * emotionSizeBoost;
  const particleMaxSize = (isWorking ? 12 : isAiThinking ? 6 : 8) * emotionSizeBoost;
  const innerParticleMin = (isWorking ? 4 : isAiThinking ? 2 : 3) * emotionSizeBoost;
  const innerParticleMax = (isWorking ? 8 : isAiThinking ? 4 : 5) * emotionSizeBoost;

  const particles = useMemo(() => {
    return Array.from({ length: geo.particles }, (_, i) => {
      const angle = (i * 2 * Math.PI) / geo.particles;
      const x = geo.a * Math.cos(angle);
      const y = geo.b * Math.sin(angle);
      const sizeFactor = 0.6 + 0.4 * Math.abs(Math.sin(angle * 2));
      return { x, y, delay: i * 0.15, sizeFactor };
    });
  }, [geo]);

  const innerParticles = useMemo(() => {
    return Array.from({ length: geo.innerParticles }, (_, i) => {
      const angle = (i * 2 * Math.PI) / geo.innerParticles;
      const x = geo.innerA * Math.cos(angle);
      const y = geo.innerB * Math.sin(angle);
      const sizeFactor = 0.7 + 0.3 * Math.abs(Math.cos(angle * 1.5));
      return { x, y, delay: i * 0.2, sizeFactor };
    });
  }, [geo]);

  return (
    <>
      {/* Keyframes injected at module level — no inline <style> needed */}

      {/* Inner glow ring - soft radial glow behind particles */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${geo.a * 2 + 20}px`,
          height: `${geo.b * 2 + 20}px`,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${color}44 0%, ${color}22 40%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, innerGlowPulse 2s ease-in-out 0.5s infinite`
            : exitAnim,
          opacity: isActive ? undefined : 0,
          filter: isMobile ? 'none' : 'blur(6px)',
          transition: 'background 0.5s ease',
          willChange: isActive ? 'opacity' : 'auto',
        }}
      />

      {/* Glowing elliptical ring - enhanced border and glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${geo.a * 2 + 8}px`,
          height: `${geo.b * 2 + 8}px`,
          borderRadius: '50%',
          border: `2px solid ${color}88`,
          boxShadow: isMobile
            ? `0 0 12px ${color}44, inset 0 0 10px ${color}33`
            : `0 0 30px ${color}55, 0 0 60px ${color}33, inset 0 0 30px ${color}44`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, ringPulse 2.5s ease-in-out 0.5s infinite`
            : exitAnim,
          opacity: isActive ? undefined : 0,
          transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
          willChange: isActive ? 'transform, opacity' : 'auto',
        }}
      />

      {/* Inner counter-rotating particle ring */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${geo.innerA * 2}px`,
          height: `${geo.innerB * 2}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, thoughtHaloRotateReverse ${innerRotationSpeed} linear 0.5s infinite`
            : exitAnim,
          opacity: isActive ? undefined : 0,
          willChange: isActive ? 'transform, opacity' : 'auto',
        }}
      >
        {innerParticles.map((p, i) => {
          const size = innerParticleMin + (innerParticleMax - innerParticleMin) * p.sizeFactor;
          return (
            <div
              key={`inner-${i}`}
              style={{
                position: 'absolute',
                left: `${geo.innerA + p.x}px`,
                top: `${geo.innerB + p.y}px`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: color,
                boxShadow: isMobile
                  ? 'none'
                  : `0 0 ${size * 3}px ${color}aa, 0 0 ${size * 1.5}px ${color}cc`,
                transform: 'translate(-50%, -50%)',
                animation: isActive
                  ? `particlePulseInner 1.8s ease-in-out ${p.delay}s infinite`
                  : 'none',
                opacity: isActive ? undefined : 0,
                transition: isMobile ? 'none' : 'background-color 0.5s ease, box-shadow 0.5s ease',
              }}
            />
          );
        })}
      </div>

      {/* Main outer particle ring */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${geo.a * 2}px`,
          height: `${geo.b * 2}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, thoughtHaloRotate ${rotationSpeed} linear 0.5s infinite`
            : exitAnim,
          opacity: isActive ? undefined : 0,
          willChange: isActive ? 'transform, opacity' : 'auto',
        }}
      >
        {particles.map((p, i) => {
          const size = particleMinSize + (particleMaxSize - particleMinSize) * p.sizeFactor;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${geo.a + p.x}px`,
                top: `${geo.b + p.y}px`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: color,
                boxShadow: isMobile
                  ? `0 0 ${size * 2}px ${color}66`
                  : `0 0 ${size * 4}px ${color}88, 0 0 ${size * 2}px ${color}bb`,
                transform: 'translate(-50%, -50%)',
                animation: isActive
                  ? `particlePulse 2s ease-in-out ${p.delay}s infinite`
                  : 'none',
                opacity: isActive ? undefined : 0,
                transition: 'background-color 0.5s ease, box-shadow 0.5s ease',
              }}
            />
          );
        })}
      </div>
    </>
  );
});

ThoughtHalo.displayName = 'ThoughtHalo';
