/**
 * CinematicOverture — 6-phase cinematic landing experience.
 *
 * Phase timeline:
 *   0 (VOID+PULSE):    Particles float, center pulse glow     0.0s
 *   1 (SILHOUETTE):    LingSilhouette fades in, converge       1.5s
 *   2 (AWAKEN):        Silhouette brightens, particles orbit   3.0s
 *   3 (VITALS+GAZE):   VitalsBar slides in from top            4.0s
 *   4 (SPEAK+CTA):     Typewriter daily statement + CTA        5.0s
 *   5 (IDLE):          Waiting, CTA pulses                     6.0s
 *
 * Skip: click/tap/keyboard anytime → jump to Phase 5.
 * Returning user (sessionStorage): start at Phase 5.
 * Reduced motion: start at Phase 5.
 */

import { memo, useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";
import { LingSilhouette } from "./LingSilhouette";
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
import { getDailyStatement } from "@/data/daily-statements";
import { trackEvent } from "@/utils/analytics";

const SS_OVERTURE_SEEN = "ling-overture-seen";

interface CinematicOvertureProps {
  onComplete: () => void;
}

const PHASE_TIMINGS = [0, 1500, 3000, 4000, 5000, 6000] as const;

const PHASE_TO_PARTICLE: Record<number, ParticlePhase> = {
  0: "float",
  1: "converge",
  2: "orbit",
  3: "orbit",
  4: "fade",
  5: "fade",
};

// Hoisted style objects for zero-allocation rendering
const S_ROOT: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 500,
  background: "var(--ling-void-bottom, #060608)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const S_VITALS_WRAP: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
  opacity: 0,
  transform: "translateY(-20px)",
  transition: "opacity 400ms var(--ling-ease-enter, ease-out), transform 400ms var(--ling-ease-enter, ease-out)",
};

const S_VITALS_VISIBLE: CSSProperties = {
  ...S_VITALS_WRAP,
  opacity: 1,
  transform: "translateY(0)",
};

const S_STATEMENT: CSSProperties = {
  position: "absolute",
  bottom: "22%",
  left: "50%",
  transform: "translateX(-50%)",
  textAlign: "center",
  zIndex: 10,
  color: "var(--ling-text-1, #FAFAFA)",
  fontStyle: "italic",
  fontSize: "clamp(1rem, 2.5vw, 1.5rem)",
  letterSpacing: "0.02em",
  textShadow: "0 2px 20px rgba(0, 0, 0, 0.8)",
  maxWidth: "80vw",
  opacity: 0,
  transition: "opacity 500ms var(--ling-ease-enter, ease-out)",
};

const S_STATEMENT_VISIBLE: CSSProperties = {
  ...S_STATEMENT,
  opacity: 1,
};

const S_CTA: CSSProperties = {
  position: "absolute",
  bottom: "12%",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 10,
  padding: "14px 40px",
  fontSize: "16px",
  fontWeight: 600,
  color: "var(--ling-text-1, #FAFAFA)",
  background: "rgba(139, 92, 246, 0.3)",
  border: "1px solid rgba(139, 92, 246, 0.6)",
  borderRadius: "var(--ling-radius-full, 9999px)",
  cursor: "pointer",
  opacity: 0,
  transition: "opacity 400ms var(--ling-ease-enter, ease-out), background 0.2s, border-color 0.2s",
};

const S_CTA_VISIBLE: CSSProperties = {
  ...S_CTA,
  opacity: 1,
  animation: "lingCtaPulse 3s ease-in-out infinite",
};

const S_SKIP: CSSProperties = {
  position: "absolute",
  bottom: "var(--ling-space-6, 24px)",
  right: "var(--ling-space-6, 24px)",
  zIndex: 20,
  padding: "8px 16px",
  fontSize: "13px",
  color: "var(--ling-text-3, #71717A)",
  background: "none",
  border: "none",
  cursor: "pointer",
  transition: "color 200ms",
};

const S_SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
};

const S_PULSE: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 100,
  height: 100,
  borderRadius: "50%",
  background: "radial-gradient(circle, var(--ling-accent-20, rgba(139,92,246,0.2)) 0%, transparent 70%)",
  animation: "silhouetteBreath 4s ease-in-out infinite",
  pointerEvents: "none" as const,
};

export const CinematicOverture = memo(function CinematicOverture({
  onComplete,
}: CinematicOvertureProps) {
  const { t } = useTranslation();
  const vitals = useVitalsData();
  const dayNumber = 90 - vitals.daysRemaining;
  const statement = getDailyStatement(dayNumber);

  // Should we skip entirely?
  const shouldSkip = useRef(
    typeof window !== "undefined" && (
      sessionStorage.getItem(SS_OVERTURE_SEEN) === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  );

  const [phase, setPhase] = useState(shouldSkip.current ? 5 : 0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);

  // Typewriter state
  const [typedText, setTypedText] = useState(shouldSkip.current ? statement : "");

  // Auto-advance phases
  useEffect(() => {
    if (shouldSkip.current) {
      if (!completedRef.current) {
        completedRef.current = true;
        sessionStorage.setItem(SS_OVERTURE_SEEN, "true");
        onComplete();
      }
      return;
    }

    for (let i = 1; i < PHASE_TIMINGS.length; i++) {
      const timer = setTimeout(() => setPhase(i), PHASE_TIMINGS[i]);
      timersRef.current.push(timer);
    }

    // Mark as seen after full sequence
    const seenTimer = setTimeout(() => {
      sessionStorage.setItem(SS_OVERTURE_SEEN, "true");
      trackEvent("overture_completed");
    }, PHASE_TIMINGS[5]);
    timersRef.current.push(seenTimer);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  // Typewriter effect for daily statement (Phase 4+)
  useEffect(() => {
    if (phase < 4 || shouldSkip.current) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedText(statement.slice(0, i));
      if (i >= statement.length) clearInterval(interval);
    }, 35);
    return () => clearInterval(interval);
  }, [phase, statement]);

  // Skip handler — jump to Phase 5
  const skipToEnd = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase(5);
    setTypedText(statement);
    sessionStorage.setItem(SS_OVERTURE_SEEN, "true");
    trackEvent("overture_skipped", { phase });
  }, [phase, statement]);

  // CTA handler
  const handleCta = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [onComplete]);

  // Keyboard skip
  useEffect(() => {
    if (shouldSkip.current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (phase < 5) skipToEnd();
        else handleCta();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, skipToEnd, handleCta]);

  // If skipped, don't render overture
  if (shouldSkip.current) return null;

  const particlePhase = PHASE_TO_PARTICLE[phase] || "fade";
  const showSilhouette = phase >= 1 && phase <= 2;
  const showVitals = phase >= 3;
  const showStatement = phase >= 4;
  const showCta = phase >= 4;

  return (
    <div style={S_ROOT} data-phase={phase} onClick={phase < 5 ? skipToEnd : undefined}>
      <ParticleCanvas phase={particlePhase} />

      {/* Center pulse glow (Phase 0) */}
      {phase === 0 && <div style={S_PULSE} />}

      {/* Silhouette (Phase 1-2) */}
      <LingSilhouette visible={showSilhouette} breathing={phase >= 2} />

      {/* VitalsBar (Phase 3+) */}
      <div style={showVitals ? S_VITALS_VISIBLE : S_VITALS_WRAP}>
        <VitalsBar vitals={vitals} />
      </div>

      {/* Daily statement (Phase 4+) */}
      <div style={showStatement ? S_STATEMENT_VISIBLE : S_STATEMENT}>
        <p>&ldquo;{typedText}&rdquo;</p>
      </div>

      {/* CTA (Phase 4+) */}
      <button
        style={showCta ? S_CTA_VISIBLE : S_CTA}
        onClick={(e) => { e.stopPropagation(); handleCta(); }}
      >
        {t("witness.talkToLing", { defaultValue: "Talk to Ling" })}
      </button>

      {/* Skip button */}
      {phase < 5 && (
        <button style={S_SKIP} onClick={(e) => { e.stopPropagation(); skipToEnd(); }}>
          {t("overture.skip", { defaultValue: "Skip" })}
        </button>
      )}

      {/* Accessibility announcements */}
      <div aria-live="polite" style={S_SR_ONLY}>
        {phase === 0 && t("overture.awakening", { defaultValue: "Ling is awakening..." })}
        {phase >= 4 && typedText}
      </div>
    </div>
  );
});
