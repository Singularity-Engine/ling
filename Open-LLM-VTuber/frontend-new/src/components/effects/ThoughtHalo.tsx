import { memo, useMemo } from 'react';
import { useToolState, ToolCategory } from '../../context/tool-state-context';

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: '#60a5fa',
  code: '#10b981',
  memory: '#a78bfa',
  weather: '#facc15',
  generic: '#8b5cf6',
};

const PARTICLE_COUNT = 14;
const ELLIPSE_A = 60; // semi-major axis (px)
const ELLIPSE_B = 20; // semi-minor axis (px)

export const ThoughtHalo = memo(() => {
  const { currentPhase, dominantCategory } = useToolState();
  const isActive = currentPhase === 'thinking' || currentPhase === 'working';
  const color = CATEGORY_COLORS[dominantCategory ?? 'generic'];

  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i * 2 * Math.PI) / PARTICLE_COUNT;
      const x = ELLIPSE_A * Math.cos(angle);
      const y = ELLIPSE_B * Math.sin(angle);
      return { x, y, delay: (i * 0.15) };
    });
  }, []);

  return (
    <>
      <style>{`
        @keyframes thoughtHaloRotate {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
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
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
        }
      `}</style>
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
            ? 'thoughtHaloEnter 0.5s ease-out forwards, thoughtHaloRotate 3s linear 0.5s infinite'
            : 'thoughtHaloExit 0.3s ease-in forwards',
          opacity: isActive ? undefined : 0,
          willChange: 'transform, opacity',
        }}
      >
        {particles.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${ELLIPSE_A + p.x}px`,
              top: `${ELLIPSE_B + p.y}px`,
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: color,
              boxShadow: `0 0 20px ${color}66, 0 0 6px ${color}99`,
              transform: 'translate(-50%, -50%)',
              animation: isActive
                ? `particlePulse 2s ease-in-out ${p.delay}s infinite`
                : 'none',
              opacity: isActive ? undefined : 0,
              transition: 'background-color 0.5s ease, box-shadow 0.5s ease',
            }}
          />
        ))}
      </div>
    </>
  );
});

ThoughtHalo.displayName = 'ThoughtHalo';
