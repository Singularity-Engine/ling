/**
 * LandingAnimation — 6-phase cinematic overture engine.
 *
 * Phases:
 *   0 VOID+PULSE    — particles float, center pulse glow
 *   1 SILHOUETTE    — LingSilhouette visible, particles converge→orbit
 *   2 AWAKEN        — crossfade silhouette out (opacity to 0)
 *   3 VITALS+GAZE   — VitalsBar slides in from top
 *   4 SPEAK+CTA     — typewriter daily statement + CTA button appears
 *   5 IDLE          — CTA pulses, waiting for user action
 *
 * Skip: anytime via Skip button → jump to onComplete
 * Returning user (sessionStorage): skip entirely
 * Reduced motion: skip entirely
 */

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";
import { LingSilhouette } from "./LingSilhouette";
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
import { getDailyStatement } from "@/data/daily-statements";
import { prefersReducedMotion } from "@/utils/reduced-motion";
import { trackEvent } from "@/utils/analytics";

interface LandingAnimationProps {
  onComplete: () => void;
}

const SS_KEY = "ling-overture-seen";
const TYPE_SPEED_MS = 50;

/* ── Map overture phase to particle phase ─── */
function toParticlePhase(phase: number): ParticlePhase {
  switch (phase) {
    case 0: return "float";
    case 1: return "converge";
    case 2: return "orbit";
    default: return "fade";
  }
}

/* ── Hoisted style constants (CSSProperties) ─────────────────── */

const S_ROOT: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "var(--ling-bg-deep)",
  overflow: "hidden",
};

const S_PULSE_GLOW: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: 200,
  height: 200,
  marginTop: -100,
  marginLeft: -100,
  borderRadius: "50%",
  background: "radial-gradient(circle, var(--ling-purple-40) 0%, var(--ling-purple-12) 50%, transparent 70%)",
  animation: "pulse 2s ease-in-out infinite",
  pointerEvents: "none",
  zIndex: 2,
};

const S_VITALS_WRAP: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  zIndex: 50,
};

const S_STATEMENT: React.CSSProperties = {
  position: "absolute",
  bottom: "25%",
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(90vw, 560px)",
  textAlign: "center",
  fontStyle: "italic",
  fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
  color: "var(--ling-text-secondary)",
  textShadow: "0 0 20px var(--ling-purple-25)",
  lineHeight: 1.6,
  zIndex: 10,
};

const S_CTA: React.CSSProperties = {
  position: "absolute",
  bottom: "12%",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "14px 40px",
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "#fff",
  background: "linear-gradient(135deg, var(--ling-purple) 0%, var(--ling-purple-deep) 100%)",
  border: "1px solid var(--ling-purple-30)",
  borderRadius: 999,
  cursor: "pointer",
  boxShadow: "0 0 24px var(--ling-purple-40), 0 0 48px var(--ling-purple-20), inset 0 1px 0 rgba(255,255,255,0.15)",
  animation: "lingCtaPulse 2.5s ease-in-out infinite",
  zIndex: 10,
  letterSpacing: "0.04em",
  font: "inherit",
};

const S_SKIP: React.CSSProperties = {
  position: "absolute",
  bottom: "4%",
  right: "4%",
  padding: "8px 16px",
  fontSize: "0.75rem",
  color: "var(--ling-text-tertiary)",
  background: "none",
  border: "none",
  cursor: "pointer",
  opacity: 0.5,
  zIndex: 20,
  font: "inherit",
  minWidth: 48,
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/* ── Phase timeline (ms) ─────────────────── */
const PHASE_TIMES = [0, 1500, 3000, 4000, 5000, 6000] as const;

export const LandingAnimation = memo(function LandingAnimation({
  onComplete,
}: LandingAnimationProps) {
  const [phase, setPhase] = useState(0);
  const [typewriterText, setTypewriterText] = useState("");
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseProgressRef = useRef(0);
  const completedRef = useRef(false);

  // Get today's daily statement (day of year)
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const statement = getDailyStatement(dayOfYear);

  // Vitals data for VitalsBar
  const vitals = useVitalsData();

  // handleComplete — cleans up and delegates to parent (parent owns sessionStorage)
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    // Clean up timers
    phaseTimerRef.current.forEach(clearTimeout);
    phaseTimerRef.current = [];
    onComplete();
  }, [onComplete]);

  // Returning user or reduced motion: skip entirely
  useEffect(() => {
    if (sessionStorage.getItem(SS_KEY) || prefersReducedMotion()) {
      handleComplete();
    }
  }, [handleComplete]);

  // Phase timeline engine (setTimeout chain)
  useEffect(() => {
    // If already completed (returning user / reduced motion), don't start
    if (completedRef.current) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1 at 1.5s
    timers.push(setTimeout(() => setPhase(1), PHASE_TIMES[1]));
    // Phase 2 at 3.0s
    timers.push(setTimeout(() => setPhase(2), PHASE_TIMES[2]));
    // Phase 3 at 4.0s
    timers.push(setTimeout(() => setPhase(3), PHASE_TIMES[3]));
    // Phase 4 at 5.0s
    timers.push(setTimeout(() => setPhase(4), PHASE_TIMES[4]));
    // Phase 5 at 6.0s
    timers.push(setTimeout(() => setPhase(5), PHASE_TIMES[5]));

    phaseTimerRef.current = timers;

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // Update phaseProgressRef for converge phase (used by ParticleCanvas)
  useEffect(() => {
    if (phase !== 1) return;

    const startTime = performance.now();
    const duration = PHASE_TIMES[2] - PHASE_TIMES[1]; // 1500ms
    let rafId = 0;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      phaseProgressRef.current = Math.min(1, elapsed / duration);
      if (elapsed < duration) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  // Typewriter effect: type statement character by character when phase >= 4
  useEffect(() => {
    if (phase < 4 || completedRef.current) return;

    let charIndex = 0;
    setTypewriterText("");

    const tick = () => {
      charIndex++;
      setTypewriterText(statement.slice(0, charIndex));
    };

    const intervalId = setInterval(tick, TYPE_SPEED_MS);

    // Stop when complete
    const totalTime = statement.length * TYPE_SPEED_MS + 50;
    const stopTimer = setTimeout(() => {
      clearInterval(intervalId);
      setTypewriterText(statement);
    }, totalTime);

    return () => {
      clearInterval(intervalId);
      clearTimeout(stopTimer);
    };
  }, [phase, statement]);

  // Fire overture_completed when phase naturally reaches 5 (idle)
  useEffect(() => {
    if (phase === 5) trackEvent("overture_completed");
  }, [phase]);

  // Keyboard skip (Escape or Enter/Space)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        if (phase < 5) trackEvent("overture_skipped", { phase });
        handleComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleComplete, phase]);

  // If already completed, render nothing
  if (completedRef.current && phase === 0) {
    return null;
  }

  const particlePhase = toParticlePhase(phase);

  return (
    <div style={S_ROOT} data-phase={phase}>
      {/* Particles background */}
      <ParticleCanvas phase={particlePhase} phaseProgressRef={phaseProgressRef} />

      {/* Center pulse glow (phase 0) */}
      {phase === 0 && <div style={S_PULSE_GLOW} />}

      {/* Silhouette (phases 1-2) */}
      <LingSilhouette visible={phase >= 1 && phase <= 2} breathing={phase === 1} />

      {/* VitalsBar (phase 3+) */}
      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            key="vitals"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
            style={S_VITALS_WRAP}
          >
            <VitalsBar vitals={vitals} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statement text (phase 4+) with typewriter effect */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.div
            key="statement"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={S_STATEMENT}
          >
            <p>{typewriterText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA button (phase 4+) */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.button
            key="cta"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={S_CTA}
            onClick={handleComplete}
          >
            Talk to Ling
          </motion.button>
        )}
      </AnimatePresence>

      {/* Skip button (always visible in phases 0-4) */}
      {phase < 5 && (
        <button style={S_SKIP} onClick={() => { trackEvent("overture_skipped", { phase }); handleComplete(); }}>
          Skip {"\u2192"}
        </button>
      )}

      {/* Accessibility announcement */}
      <div role="status" aria-live="polite" style={SR_ONLY}>
        {phase === 0 && "Ling is awakening..."}
        {phase === 4 && statement}
      </div>
    </div>
  );
});
