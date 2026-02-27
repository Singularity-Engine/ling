import { memo, useRef, useEffect, useCallback } from "react";

export type ParticlePhase = "float" | "converge" | "orbit" | "explode" | "fade";

interface ParticleCanvasProps {
  phase: ParticlePhase;
  particleCount?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  angle: number;       // for orbit
  orbitRadius: number;  // for orbit
  orbitSpeed: number;   // for orbit
}

const ACCENT_R = 139, ACCENT_G = 92, ACCENT_B = 246;

export const ParticleCanvas = memo(function ParticleCanvas({
  phase,
  particleCount = 60,
  className,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef(phase);
  const rafRef = useRef(0);
  const centerRef = useRef({ x: 0, y: 0 });

  phaseRef.current = phase;

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.4 + 0.1,
        baseAlpha: Math.random() * 0.4 + 0.1,
        angle: Math.random() * Math.PI * 2,
        orbitRadius: Math.random() * 80 + 40,
        orbitSpeed: (Math.random() - 0.5) * 0.01,
      });
    }
    particlesRef.current = particles;
    centerRef.current = { x: w / 2, y: h / 2 };
  }, [particleCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
      centerRef.current = { x: canvas.offsetWidth / 2, y: canvas.offsetHeight / 2 };
      if (particlesRef.current.length === 0) {
        initParticles(canvas.offsetWidth, canvas.offsetHeight);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      const cx = centerRef.current.x;
      const cy = centerRef.current.y;
      const p = phaseRef.current;

      for (const pt of particlesRef.current) {
        switch (p) {
          case "float":
            pt.x += pt.vx;
            pt.y += pt.vy;
            // wrap around
            if (pt.x < 0) pt.x = w;
            if (pt.x > w) pt.x = 0;
            if (pt.y < 0) pt.y = h;
            if (pt.y > h) pt.y = 0;
            pt.alpha = pt.baseAlpha;
            break;

          case "converge": {
            const dx = cx - pt.x;
            const dy = cy - pt.y;
            pt.x += dx * 0.02;
            pt.y += dy * 0.02;
            pt.alpha = Math.min(pt.alpha + 0.005, 0.7);
            break;
          }

          case "orbit": {
            pt.angle += pt.orbitSpeed;
            const targetX = cx + Math.cos(pt.angle) * pt.orbitRadius;
            const targetY = cy + Math.sin(pt.angle) * pt.orbitRadius;
            pt.x += (targetX - pt.x) * 0.03;
            pt.y += (targetY - pt.y) * 0.03;
            pt.alpha = Math.min(pt.alpha + 0.003, 0.5);
            break;
          }

          case "explode": {
            const edx = pt.x - cx;
            const edy = pt.y - cy;
            const dist = Math.sqrt(edx * edx + edy * edy) || 1;
            pt.x += (edx / dist) * 3;
            pt.y += (edy / dist) * 3;
            pt.alpha = Math.max(pt.alpha - 0.01, 0);
            break;
          }

          case "fade":
            pt.alpha = Math.max(pt.alpha - 0.005, 0);
            break;
        }

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_R}, ${ACCENT_G}, ${ACCENT_B}, ${pt.alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
});
