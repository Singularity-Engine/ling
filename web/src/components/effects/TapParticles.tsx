import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "@/utils/reduced-motion";

const EMOJIS = ["❤️", "💜", "✨", "💫", "🩷"];
const PARTICLE_COUNT = 5;
const PARTICLE_LIFETIME_MS = 1200;
const TAP_DURATION_MS = 250;
const TAP_DISTANCE_PX = 8;

// Static container style — avoids recreating the object on every render.
const S_CONTAINER: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 50,
  overflow: "hidden",
};

interface Particle {
  id: number;
  emoji: string;
  /** Pre-computed at spawn time — values never change, so no need to rebuild each render. */
  style: CSSProperties;
}

/**
 * Self-contained CSS-only particle burst on Live2D canvas tap.
 * Attaches native pointer listeners to #canvas — no restricted file edits needed.
 */
export const TapParticles = memo(() => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const spawn = useCallback((clientX: number, clientY: number) => {
    // Skip particle animation for users who prefer reduced motion
    if (prefersReducedMotion()) return;
    const batch: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const scale = 0.7 + Math.random() * 0.6;
      return {
        id: ++idRef.current,
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        style: {
          position: "absolute" as const,
          left: clientX + (Math.random() - 0.5) * 30,
          top: clientY - 10,
          fontSize: `${18 * scale}px`,
          animationDelay: `${Math.random() * 80}ms`,
          ["--drift" as string]: `${(Math.random() - 0.5) * 50}px`,
        },
      };
    });
    setParticles(prev => [...prev, ...batch]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      const ids = new Set(batch.map(p => p.id));
      setParticles(prev => prev.filter(p => !ids.has(p.id)));
    }, PARTICLE_LIFETIME_MS + 300);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const canvas = document.getElementById("canvas");
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    const onUp = (e: PointerEvent) => {
      const d = downRef.current;
      if (!d) return;
      downRef.current = null;

      const dt = Date.now() - d.t;
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (dt < TAP_DURATION_MS && dist < TAP_DISTANCE_PX) {
        spawn(e.clientX, e.clientY);
      }
    };

    // Use capture phase so we see the events before the Live2D handler
    canvas.addEventListener("pointerdown", onDown, true);
    canvas.addEventListener("pointerup", onUp, true);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("pointerup", onUp, true);
    };
  }, [spawn]);

  if (particles.length === 0) return null;

  return (
    <div style={S_CONTAINER}>
      {particles.map(p => (
        <span key={p.id} className="ling-tap-particle" style={p.style}>
          {p.emoji}
        </span>
      ))}
    </div>
  );
});

TapParticles.displayName = "TapParticles";
