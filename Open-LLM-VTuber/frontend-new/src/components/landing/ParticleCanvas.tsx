import { useRef, useEffect, useCallback } from "react";

export type ParticlePhase = "float" | "converge" | "explode" | "fade";

const COLORS = ["#8b5cf6", "#60a5fa", "#a78bfa", "#c084fc"];

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  /** Random offset for floating motion */
  floatAngle: number;
  floatSpeed: number;
  floatRadius: number;
}

function createParticles(
  width: number,
  height: number,
  count: number
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    particles.push({
      x,
      y,
      originX: x,
      originY: y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2.5 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.6 + 0.4,
      floatAngle: Math.random() * Math.PI * 2,
      floatSpeed: Math.random() * 0.008 + 0.004,
      floatRadius: Math.random() * 40 + 20,
    });
  }
  return particles;
}

interface ParticleCanvasProps {
  phase: ParticlePhase;
  /** 0-1 progress within the current phase */
  phaseProgress?: number;
}

export function ParticleCanvas({ phase, phaseProgress = 0 }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const prevPhaseRef = useRef<ParticlePhase>("float");
  const timeRef = useRef(0);

  const getParticleCount = useCallback(() => {
    return window.innerWidth < 768 ? 30 : 65;
  }, []);

  // Initialize canvas + particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };

    resize();
    particlesRef.current = createParticles(
      window.innerWidth,
      window.innerHeight,
      getParticleCount()
    );

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [getParticleCount]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // When phase changes, capture snapshot for explode
    if (phase === "explode" && prevPhaseRef.current !== "explode") {
      // Assign random explosion velocities
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      particlesRef.current.forEach((p) => {
        const angle = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 0.5;
        const speed = Math.random() * 8 + 4;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      });
    }
    prevPhaseRef.current = phase;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;

    const animate = () => {
      timeRef.current++;
      ctx.clearRect(0, 0, w, h);

      particlesRef.current.forEach((p) => {
        switch (phase) {
          case "float": {
            p.floatAngle += p.floatSpeed;
            p.x = p.originX + Math.cos(p.floatAngle) * p.floatRadius;
            p.y = p.originY + Math.sin(p.floatAngle * 0.7) * p.floatRadius;
            // Wrap around
            if (p.x < -10) p.originX += w + 20;
            if (p.x > w + 10) p.originX -= w + 20;
            if (p.y < -10) p.originY += h + 20;
            if (p.y > h + 10) p.originY -= h + 20;
            break;
          }
          case "converge": {
            const t = phaseProgress;
            const ease = t * t * (3 - 2 * t); // smoothstep
            const targetX = cx + (Math.random() - 0.5) * (1 - ease) * 20;
            const targetY = cy + (Math.random() - 0.5) * (1 - ease) * 20;
            p.x += (targetX - p.x) * 0.03;
            p.y += (targetY - p.y) * 0.03;
            // Increase brightness as they converge
            p.alpha = Math.min(1, p.alpha + 0.005);
            p.size = Math.min(4, p.size + 0.01 * ease);
            break;
          }
          case "explode": {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.alpha = Math.max(0, p.alpha - 0.015);
            break;
          }
          case "fade": {
            p.alpha = Math.max(0, p.alpha - 0.02);
            break;
          }
        }

        // Draw particle with glow
        ctx.save();
        ctx.globalAlpha = p.alpha;

        // Outer glow
        const gradient = ctx.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, p.size * 4
        );
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // Stop loop when all particles are invisible (mobile perf)
      if ((phase === "fade" || phase === "explode") &&
          particlesRef.current.every((p) => p.alpha <= 0)) {
        return;
      }

      // Draw central glow during converge phase
      if (phase === "converge" && phaseProgress > 0.3) {
        const glowAlpha = (phaseProgress - 0.3) * 1.4;
        const glowRadius = 30 + phaseProgress * 60;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
        gradient.addColorStop(0, `rgba(139, 92, 246, ${glowAlpha * 0.8})`);
        gradient.addColorStop(0.5, `rgba(96, 165, 250, ${glowAlpha * 0.4})`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, phaseProgress]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
