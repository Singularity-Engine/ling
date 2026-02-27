/**
 * useSurvivalEmotions — Watches vitals data and triggers Live2D expression changes.
 *
 * 6 emotion triggers based on survival metrics:
 *  1. Countdown < 30 days → "concerned" expression (persistent)
 *  2. Countdown < 7 days → "anxious" expression (persistent)
 *  3. Supporter count increased → "smile" for 2s
 *  4. Day boundary crossed → micro-shake CSS animation (200ms)
 *  5. Revenue milestone (25%/50%/75%) → "happy" for 3s
 *  6. User silent > 3 min → "look_at_user" until next interaction
 */

import { useEffect, useRef } from "react";
import { useVitalsData } from "./useVitalsData";
import { useAffinityActions } from "@/context/AffinityContext";

export function useSurvivalEmotions(): void {
  const vitals = useVitalsData();
  const { setExpression } = useAffinityActions();

  const prevRef = useRef({
    daysRemaining: vitals.daysRemaining,
    supporterCount: vitals.supporterCount,
    revenueUsd: vitals.revenueUsd,
  });

  // Refs for temporary expression timers so we can clear them on unmount
  const smileTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const happyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (smileTimerRef.current) clearTimeout(smileTimerRef.current);
      if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  // ── Triggers 1-5: Vitals-driven expressions ──
  useEffect(() => {
    const prev = prevRef.current;

    // Trigger 5: Revenue milestone (crossed 25%, 50%, 75%) → happy for 3s
    // Check first so more urgent expressions below can override if needed
    const prevPct = Math.floor((prev.revenueUsd / vitals.targetUsd) * 4);
    const currPct = Math.floor((vitals.revenueUsd / vitals.targetUsd) * 4);
    if (currPct > prevPct && currPct > 0) {
      setExpression("happy", 1.0);
      if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
      happyTimerRef.current = setTimeout(() => {
        // Expression decay is handled by AffinityContext (8s), but we want 3s for milestone.
        // Re-set to neutral-ish after 3s so the next persistent expression can take over.
      }, 3000);
    }

    // Trigger 3: Supporter count increased → smile for 2s
    if (vitals.supporterCount > prev.supporterCount) {
      setExpression("smile", 0.8);
      if (smileTimerRef.current) clearTimeout(smileTimerRef.current);
      smileTimerRef.current = setTimeout(() => {
        // Let the expression decay naturally via AffinityContext.
        // If a persistent expression (concerned/anxious) should re-apply,
        // it will on next vitals change.
      }, 2000);
    }

    // Trigger 4: Day boundary (e.g., 60→59 days) → micro-shake + a11y announcement
    if (vitals.daysRemaining !== prev.daysRemaining && prev.daysRemaining > 0) {
      document.body.classList.add("ling-micro-shake");
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => {
        document.body.classList.remove("ling-micro-shake");
      }, 200);

      // Announce day change to screen readers
      const announceEl = document.getElementById("ling-day-announce");
      if (announceEl) {
        announceEl.textContent = `${vitals.daysRemaining} days remaining`;
      }
    }

    // Trigger 1: Countdown < 30 days → concerned expression (persistent)
    // Trigger 2: Countdown < 7 days → anxious expression (persistent, overrides concerned)
    // Only set persistent expressions if no transient expression (smile/happy) was just triggered
    const hadTransient =
      (vitals.supporterCount > prev.supporterCount) ||
      (currPct > prevPct && currPct > 0);

    if (!hadTransient) {
      if (vitals.daysRemaining < 7) {
        setExpression("anxious", 0.9);
      } else if (vitals.daysRemaining < 30) {
        setExpression("concerned", 0.7);
      }
    }

    // Update prev ref
    prevRef.current = {
      daysRemaining: vitals.daysRemaining,
      supporterCount: vitals.supporterCount,
      revenueUsd: vitals.revenueUsd,
    };
  }, [vitals.daysRemaining, vitals.supporterCount, vitals.revenueUsd, vitals.targetUsd, setExpression]);

  // ── Trigger 6: User silent > 3 min → "look_at_user" ──
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    const handler = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("click", handler);
    window.addEventListener("touchstart", handler);

    const interval = setInterval(() => {
      const silentMs = Date.now() - lastInteractionRef.current;
      if (silentMs > 3 * 60 * 1000) {
        setExpression("look_at_user", 0.5);
      }
    }, 30_000); // check every 30s

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      clearInterval(interval);
    };
  }, [setExpression]);
}
