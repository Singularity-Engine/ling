import { useRef, useEffect, useCallback, memo } from "react";
import { MOBILE_BREAKPOINT } from "@/constants/breakpoints";

export type ParticlePhase = "float" | "converge" | "explode" | "fade";

// Canvas 2D context 无法读取 CSS 变量，此处保留字面量（与 --ling-purple 色系一致）
const COLORS = ["#8b5cf6", "#60a5fa", "#a78bfa", "#c084fc"];

/** Diameter of each pre-rendered glow sprite (px) */
const SPRITE_SIZE = 64;

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  colorIndex: number;
  alpha: number;
  /** Random offset for floating motion */
  floatAngle: number;
  floatSpeed: number;
  floatRadius: number;
  /** Fixed angle for deterministic converge path */
  convergeAngle: number;
}

/**
 * Pre-render a radial glow sprite per color on an offscreen canvas.
 * Replaces per-particle-per-frame createRadialGradient calls with
 * GPU-accelerated drawImage.
 */
function createGlowSprites(): HTMLCanvasElement[] {
  return COLORS.map((color) => {
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const ctx = canvas.getContext("2d")!;
    const r = SPRITE_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
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
      size: Math.random() < 0.1 ? Math.random() * 3 + 3 : Math.random() * 2.5 + 1,
      colorIndex: Math.floor(Math.random() * COLORS.length),
      alpha: Math.random() * 0.6 + 0.4,
      floatAngle: Math.random() * Math.PI * 2,
      floatSpeed: Math.random() * 0.008 + 0.004,
      floatRadius: Math.random() * 40 + 20,
      convergeAngle: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

const S_CANVAS: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  pointerEvents: "none",
  zIndex: 1,
};

interface ParticleCanvasProps {
  phase: ParticlePhase;
  /** Mutable ref to 0-1 progress within the current phase (read-only for us) */
  phaseProgressRef: { readonly current: number };
}

/**
 * Full-screen particle canvas. Perf notes:
 * - Glow gradients are pre-rendered to offscreen canvases (1 per color)
 * - phaseProgress is passed as a ref to avoid re-creating the animation loop
 * - Wrapped in React.memo to prevent parent typewriter re-renders from triggering reconciliation
 */
export const ParticleCanvas = memo(function ParticleCanvas({
  phase,
  phaseProgressRef,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const prevPhaseRef = useRef<ParticlePhase>("float");
  const glowSpritesRef = useRef<HTMLCanvasElement[]>([]);

  const getParticleCount = useCallback(() => {
    return window.innerWidth < MOBILE_BREAKPOINT ? 40 : 100;
  }, []);

  // Initialize canvas + particles + glow sprites
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    glowSpritesRef.current = createGlowSprites();

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

    let resizeRaf = 0;
    const throttledResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
    };
    window.addEventListener("resize", throttledResize);
    return () => {
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", throttledResize);
    };
  }, [getParticleCount]);

  // Animation loop — only restarts on phase change (NOT on phaseProgress)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // When phase changes to explode, assign explosion velocities
    if (phase === "explode" && prevPhaseRef.current !== "explode") {
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
    const glowSprites = glowSpritesRef.current;

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      // Read progress from ref — no React re-render needed
      const phaseProgress = phaseProgressRef.current;

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

        // Draw particle — no ctx.save/restore, just set globalAlpha directly
        ctx.globalAlpha = p.alpha;

        // Outer glow via pre-rendered sprite (drawImage, GPU-accelerated)
        const glowDiameter = p.size * 8;
        ctx.drawImage(
          glowSprites[p.colorIndex],
          p.x - glowDiameter / 2,
          p.y - glowDiameter / 2,
          glowDiameter,
          glowDiameter
        );

        // Core
        ctx.fillStyle = COLORS[p.colorIndex];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Reset globalAlpha for subsequent draws
      ctx.globalAlpha = 1;

      // Stop loop when all particles are invisible
      if ((phase === "fade" || phase === "explode") &&
          particlesRef.current.every((p) => p.alpha <= 0)) {
        return;
      }

      // Draw central glow during converge phase (single gradient per frame — acceptable)
      if (phase === "converge" && phaseProgressRef.current > 0.3) {
        const progress = phaseProgressRef.current;
        const glowAlpha = (progress - 0.3) * 1.4;
        const glowRadius = 30 + progress * 60;
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
  }, [phase, phaseProgressRef]);

  return (
    <canvas
      ref={canvasRef}
      style={S_CANVAS}
      aria-hidden="true"
    />
  );
});
