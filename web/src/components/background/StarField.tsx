import { memo, useEffect, useRef, type CSSProperties } from "react";

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

// Opaque star colors per layer — used with ctx.globalAlpha so per-star alpha
// is a numeric assignment instead of a string concatenation + parse per frame.
// Layer 0 (far): purpleMix=10 → 210,210 | Layer 1 (mid): 25 → 225,225 | Layer 2 (near): 40 → 240,240
const STAR_RGB = ["rgb(210,210,255)", "rgb(225,225,255)", "rgb(240,240,255)"];

// Static canvas style — avoids recreating the object on every render.
const S_CANVAS: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Cached viewport dimensions — updated only on resize, read every frame
    // without triggering forced layout reflow (avoids 120 layout reads/sec).
    let cachedW = window.innerWidth;
    let cachedH = window.innerHeight;
    let prevW = cachedW;
    let prevH = cachedH;
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
      cachedW = newW;
      cachedH = newH;
    };
    resize();
    let resizeRaf = 0;
    const throttledResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
    };
    window.addEventListener("resize", throttledResize);
    // Fullscreen transitions may not fire resize
    let fsTimerId = 0;
    const onFsChange = () => { fsTimerId = window.setTimeout(throttledResize, 100); };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    // Initialize stars across 3 depth layers.
    // Stars are already grouped by layer (generated in layer order) so fillStyle
    // only changes 3 times per frame instead of up to 150 times.
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

    // Initialize nebulae with random phase + pre-computed transparent stop string
    nebulaeRef.current = INIT_NEBULAE.map((cfg) => ({
      ...cfg,
      pulsePhase: Math.random() * Math.PI * 2,
    }));
    // Pre-compute the fully-transparent gradient stop per nebula — constant,
    // so no template literal needed inside the 30fps loop.
    const nebTransparentStop = INIT_NEBULAE.map(
      (n) => `rgba(${n.r},${n.g},${n.b},0)`,
    );

    let time = 0;
    let lastTs = 0;
    const FRAME_INTERVAL = 1000 / 30; // 30fps — halves render cost; subtle animations don't need 60fps

    const animate = (timestamp: number) => {
      animRef.current = requestAnimationFrame(animate);
      if (lastTs && timestamp - lastTs < FRAME_INTERVAL) return;
      // dt normalized to 60fps frame units — existing speed constants stay unchanged
      const dt = lastTs ? Math.min((timestamp - lastTs) / 16.667, 4) : 1;
      lastTs = timestamp;
      time += dt;

      const w = cachedW;
      const h = cachedH;
      ctx.clearRect(0, 0, w, h);

      // ── Nebula clouds (behind stars, very faint) ──
      // Uses setTransform() instead of save/restore to avoid pushing/popping
      // the full canvas state 8 times per frame (4 nebulae × save + restore).
      const nebulae = nebulaeRef.current;
      for (let ni = 0; ni < nebulae.length; ni++) {
        const neb = nebulae[ni];
        // Slow drift
        neb.cx += neb.driftX * dt;
        neb.cy += neb.driftY * dt;
        if (neb.cx > 1.4) neb.cx = -0.4;
        else if (neb.cx < -0.4) neb.cx = 1.4;
        if (neb.cy > 1.4) neb.cy = -0.4;
        else if (neb.cy < -0.4) neb.cy = 1.4;

        const alpha =
          neb.baseAlpha *
          (0.6 + 0.4 * Math.sin(time * neb.pulseSpeed + neb.pulsePhase));
        const cx = neb.cx * w;
        const cy = neb.cy * h;
        const rx = neb.rx * w;

        // Combined DPR + translate(cx,cy) + scale(1, ry/rx) as a single matrix.
        // Equivalent to: save → translate(cx,cy) → scale(1, ry/rx) → draw → restore
        const ratio = neb.ry / neb.rx;
        ctx.setTransform(dpr, 0, 0, dpr * ratio, dpr * cx, dpr * cy);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        grad.addColorStop(0, `rgba(${neb.r},${neb.g},${neb.b},${alpha})`);
        grad.addColorStop(0.45, `rgba(${neb.r},${neb.g},${neb.b},${alpha * 0.4})`);
        grad.addColorStop(1, nebTransparentStop[ni]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
      }
      // Reset to base DPR transform for subsequent draws
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ── Stars with depth ──
      // Per-star alpha via globalAlpha (numeric assignment) instead of RGBA
      // string concatenation — eliminates ~150 string allocations per frame.
      // Stars are grouped by layer so fillStyle only changes 3 times.
      let curLayer = -1;
      for (const star of starsRef.current) {
        // Reduced motion: static brightness, no twinkle
        star.alpha = prefersReducedMotion
          ? star.baseAlpha * 0.75
          : star.baseAlpha *
            (0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset));

        if (star.layer !== curLayer) {
          curLayer = star.layer;
          ctx.fillStyle = STAR_RGB[curLayer];
        }

        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Glow halo on bright near-layer stars
        if (star.layer === 2 && star.alpha > 0.4) {
          ctx.globalAlpha = star.alpha * 0.08;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // ── Meteors (disabled under prefers-reduced-motion) ──
      // dt-scaled probability: ~0.002 per 60fps frame → consistent spawn rate
      if (!prefersReducedMotion && Math.random() < 0.002 * dt && meteorsRef.current.length < 2) {
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
        m.x += Math.cos(m.angle) * m.speed * dt;
        m.y += Math.sin(m.angle) * m.speed * dt;
        m.alpha -= m.decay * dt;

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
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(fsTimerId);
      window.removeEventListener("resize", throttledResize);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={S_CANVAS} />
  );
});

StarField.displayName = "StarField";
