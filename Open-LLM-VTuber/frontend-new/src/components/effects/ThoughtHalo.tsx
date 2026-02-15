import { memo, useMemo } from 'react';
import { useToolState, ToolCategory } from '../../context/tool-state-context';
import { useAiState } from '../../context/ai-state-context';

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: '#60a5fa',
  code: '#10b981',
  memory: '#a78bfa',
  weather: '#facc15',
  generic: '#8b5cf6',
};

const AI_THINKING_COLOR = '#c4b5fd'; // soft lavender for normal AI thinking

const PARTICLE_COUNT = 14;
const INNER_PARTICLE_COUNT = 8;
const ELLIPSE_A = 60;
const ELLIPSE_B = 20;
const INNER_A = 42;
const INNER_B = 14;

export const ThoughtHalo = memo(() => {
  const { currentPhase, dominantCategory } = useToolState();
  const { isThinkingSpeaking } = useAiState();
  const isToolActive = currentPhase === 'thinking' || currentPhase === 'working';
  const isWorking = currentPhase === 'working';
  // Show a softer halo during normal AI thinking (no tool calls)
  const isAiThinking = isThinkingSpeaking && !isToolActive;
  const isActive = isToolActive || isAiThinking;
  const color = isAiThinking ? AI_THINKING_COLOR : CATEGORY_COLORS[dominantCategory ?? 'generic'];

  const rotationSpeed = isWorking ? '1.8s' : isAiThinking ? '5s' : '3s';
  const innerRotationSpeed = isWorking ? '2.4s' : isAiThinking ? '6s' : '4s';

  // Particle sizes: ai-thinking smaller & softer, thinking 4-8px, working 6-12px
  const particleMinSize = isWorking ? 6 : isAiThinking ? 3 : 4;
  const particleMaxSize = isWorking ? 12 : isAiThinking ? 6 : 8;
  const innerParticleMin = isWorking ? 4 : isAiThinking ? 2 : 3;
  const innerParticleMax = isWorking ? 8 : isAiThinking ? 4 : 5;

  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i * 2 * Math.PI) / PARTICLE_COUNT;
      const x = ELLIPSE_A * Math.cos(angle);
      const y = ELLIPSE_B * Math.sin(angle);
      // Vary particle sizes for organic feel
      const sizeFactor = 0.6 + 0.4 * Math.abs(Math.sin(angle * 2));
      return { x, y, delay: i * 0.15, sizeFactor };
    });
  }, []);

  const innerParticles = useMemo(() => {
    return Array.from({ length: INNER_PARTICLE_COUNT }, (_, i) => {
      const angle = (i * 2 * Math.PI) / INNER_PARTICLE_COUNT;
      const x = INNER_A * Math.cos(angle);
      const y = INNER_B * Math.sin(angle);
      const sizeFactor = 0.7 + 0.3 * Math.abs(Math.cos(angle * 1.5));
      return { x, y, delay: i * 0.2, sizeFactor };
    });
  }, []);

  return (
    <>
      <style>{`
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
      `}</style>

      {/* Inner glow ring - soft radial glow behind particles */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${ELLIPSE_A * 2 + 20}px`,
          height: `${ELLIPSE_B * 2 + 20}px`,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${color}44 0%, ${color}22 40%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, innerGlowPulse 2s ease-in-out 0.5s infinite`
            : 'thoughtHaloExit 0.3s ease-in forwards',
          opacity: isActive ? undefined : 0,
          filter: 'blur(6px)',
          willChange: 'opacity',
        }}
      />

      {/* Glowing elliptical ring - enhanced border and glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${ELLIPSE_A * 2 + 8}px`,
          height: `${ELLIPSE_B * 2 + 8}px`,
          borderRadius: '50%',
          border: `2px solid ${color}88`,
          boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}33, inset 0 0 30px ${color}44`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, ringPulse 2.5s ease-in-out 0.5s infinite`
            : 'thoughtHaloExit 0.3s ease-in forwards',
          opacity: isActive ? undefined : 0,
          willChange: 'transform, opacity',
        }}
      />

      {/* Inner counter-rotating particle ring */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '27%',
          width: `${INNER_A * 2}px`,
          height: `${INNER_B * 2}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, thoughtHaloRotateReverse ${innerRotationSpeed} linear 0.5s infinite`
            : 'thoughtHaloExit 0.3s ease-in forwards',
          opacity: isActive ? undefined : 0,
          willChange: 'transform, opacity',
        }}
      >
        {innerParticles.map((p, i) => {
          const size = innerParticleMin + (innerParticleMax - innerParticleMin) * p.sizeFactor;
          return (
            <div
              key={`inner-${i}`}
              style={{
                position: 'absolute',
                left: `${INNER_A + p.x}px`,
                top: `${INNER_B + p.y}px`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: color,
                boxShadow: `0 0 ${size * 3}px ${color}aa, 0 0 ${size * 1.5}px ${color}cc`,
                transform: 'translate(-50%, -50%)',
                animation: isActive
                  ? `particlePulseInner 1.8s ease-in-out ${p.delay}s infinite`
                  : 'none',
                opacity: isActive ? undefined : 0,
                transition: 'background-color 0.5s ease, box-shadow 0.5s ease',
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
          width: `${ELLIPSE_A * 2}px`,
          height: `${ELLIPSE_B * 2}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: isActive
            ? `thoughtHaloEnter 0.5s ease-out forwards, thoughtHaloRotate ${rotationSpeed} linear 0.5s infinite`
            : 'thoughtHaloExit 0.3s ease-in forwards',
          opacity: isActive ? undefined : 0,
          willChange: 'transform, opacity',
        }}
      >
        {particles.map((p, i) => {
          const size = particleMinSize + (particleMaxSize - particleMinSize) * p.sizeFactor;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${ELLIPSE_A + p.x}px`,
                top: `${ELLIPSE_B + p.y}px`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: color,
                boxShadow: `0 0 ${size * 4}px ${color}88, 0 0 ${size * 2}px ${color}bb`,
                transform: 'translate(-50%, -50%)',
                animation: isActive
                  ? `particlePulse 2s ease-in-out ${p.delay}s infinite`
                  : 'none',
                opacity: isActive ? undefined : 0,
                transition: 'background-color 0.5s ease, box-shadow 0.5s ease, width 0.3s ease, height 0.3s ease',
              }}
            />
          );
        })}
      </div>
    </>
  );
});

ThoughtHalo.displayName = 'ThoughtHalo';
