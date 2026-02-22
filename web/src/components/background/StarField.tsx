import { memo, useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  layer: number; // 0=far, 1=mid, 2=near
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  alpha: number;
  decay: number;
}

interface Nebula {
  cx: number; // center x (ratio 0-1)
  cy: number; // center y (ratio 0-1)
  rx: number; // radius x (ratio of viewport width)
  ry: number; // radius y (ratio of viewport height)
  r: number;
  g: number;
  b: number;
  baseAlpha: number;
  driftX: number; // movement per frame (ratio)
  driftY: number;
  pulseSpeed: number;
  pulsePhase: number;
}

// Nebula cloud configurations — very faint colored patches for cosmic atmosphere
const INIT_NEBULAE: Omit<Nebula, "pulsePhase">[] = [
  { cx: 0.65, cy: 0.3, rx: 0.35, ry: 0.28, r: 139, g: 92, b: 246, baseAlpha: 0.055, driftX: 0.000025, driftY: 0.000015, pulseSpeed: 0.003 },
  { cx: 0.15, cy: 0.25, rx: 0.25, ry: 0.20, r: 96, g: 165, b: 250, baseAlpha: 0.035, driftX: -0.000018, driftY: 0.000025, pulseSpeed: 0.004 },
  { cx: 0.5, cy: 0.72, rx: 0.28, ry: 0.22, r: 167, g: 139, b: 250, baseAlpha: 0.03, driftX: 0.000030, driftY: -0.000010, pulseSpeed: 0.0025 },
  { cx: 0.85, cy: 0.55, rx: 0.18, ry: 0.14, r: 192, g: 132, b: 252, baseAlpha: 0.025, driftX: -0.000022, driftY: 0.000018, pulseSpeed: 0.0045 },
];

// Star depth-layer configurations: far (many dim), mid, near (few bright)
const STAR_LAYERS = [
  { count: 70, sizeMin: 0.3, sizeMax: 0.8, alphaMin: 0.1, alphaMax: 0.3, twinkleMin: 0.003, twinkleMax: 0.008 },
  { count: 50, sizeMin: 0.6, sizeMax: 1.3, alphaMin: 0.2, alphaMax: 0.5, twinkleMin: 0.005, twinkleMax: 0.012 },
  { count: 30, sizeMin: 1.0, sizeMax: 2.0, alphaMin: 0.3, alphaMax: 0.7, twinkleMin: 0.008, twinkleMax: 0.018 },
];

export const StarField = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const meteorsRef = useRef<Meteor[]>([]);
  const nebulaeRef = useRef<Nebula[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let prevW = window.innerWidth;
    let prevH = window.innerHeight;
    const resize = () => {
      const newW = window.innerWidth;
      const newH = window.innerHeight;
      canvas.width = newW * dpr;
      canvas.height = newH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Redistribute stars proportionally so they remain visible after resize
      if (prevW > 0 && prevH > 0) {
        const sx = newW / prevW;
        const sy = newH / prevH;
        for (const star of starsRef.current) {
          star.x *= sx;
          star.y *= sy;
        }
      }
      prevW = newW;
      prevH = newH;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize stars across 3 depth layers
    const stars: Star[] = [];
    for (let layer = 0; layer < STAR_LAYERS.length; layer++) {
      const cfg = STAR_LAYERS[layer];
      for (let i = 0; i < cfg.count; i++) {
        stars.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin),
          baseAlpha: cfg.alphaMin + Math.random() * (cfg.alphaMax - cfg.alphaMin),
          alpha: 0,
          twinkleSpeed: cfg.twinkleMin + Math.random() * (cfg.twinkleMax - cfg.twinkleMin),
          twinkleOffset: Math.random() * Math.PI * 2,
          layer,
        });
      }
    }
    starsRef.current = stars;

    // Initialize nebulae with random phase
    nebulaeRef.current = INIT_NEBULAE.map((cfg) => ({
      ...cfg,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;

    const animate = () => {
      frame++;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // ── Nebula clouds (behind stars, very faint) ──
      for (const neb of nebulaeRef.current) {
        // Slow drift
        neb.cx += neb.driftX;
        neb.cy += neb.driftY;
        if (neb.cx > 1.4) neb.cx = -0.4;
        else if (neb.cx < -0.4) neb.cx = 1.4;
        if (neb.cy > 1.4) neb.cy = -0.4;
        else if (neb.cy < -0.4) neb.cy = 1.4;

        const alpha =
          neb.baseAlpha *
          (0.6 + 0.4 * Math.sin(frame * neb.pulseSpeed + neb.pulsePhase));
        const cx = neb.cx * w;
        const cy = neb.cy * h;
        const rx = neb.rx * w;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, neb.ry / neb.rx); // elliptical shape
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        grad.addColorStop(0, `rgba(${neb.r}, ${neb.g}, ${neb.b}, ${alpha})`);
        grad.addColorStop(
          0.45,
          `rgba(${neb.r}, ${neb.g}, ${neb.b}, ${alpha * 0.4})`,
        );
        grad.addColorStop(1, `rgba(${neb.r}, ${neb.g}, ${neb.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Stars with depth ──
      for (const star of starsRef.current) {
        star.alpha =
          star.baseAlpha *
          (0.5 + 0.5 * Math.sin(frame * star.twinkleSpeed + star.twinkleOffset));

        // Layer-based coloring: far=cool white, near=warm purple-white
        const purpleMix = star.layer === 2 ? 40 : star.layer === 1 ? 25 : 10;
        const r = 200 + purpleMix;
        const g = 200 + purpleMix;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, 255, ${star.alpha})`;
        ctx.fill();

        // Glow halo on bright near-layer stars
        if (star.layer === 2 && star.alpha > 0.4) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, 255, ${star.alpha * 0.08})`;
          ctx.fill();
        }
      }

      // ── Meteors ──
      if (Math.random() < 0.002 && meteorsRef.current.length < 2) {
        meteorsRef.current.push({
          x: Math.random() * w * 0.8,
          y: Math.random() * h * 0.3,
          length: 60 + Math.random() * 80,
          speed: 4 + Math.random() * 4,
          angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
          alpha: 0.8,
          decay: 0.012 + Math.random() * 0.008,
        });
      }

      meteorsRef.current = meteorsRef.current.filter((m) => {
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.alpha -= m.decay;

        if (m.alpha <= 0) return false;

        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;

        const gradient = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        gradient.addColorStop(0, `rgba(139, 92, 246, 0)`);
        gradient.addColorStop(0.7, `rgba(196, 181, 253, ${m.alpha * 0.5})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${m.alpha})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        return true;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
});

StarField.displayName = "StarField";
