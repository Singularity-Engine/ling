import { useEffect, useRef, useState } from "react";

/**
 * First-minute experience orchestration hook.
 *
 * Timeline:
 * - 0-2s: Page loads, character fades in + starfield
 * - 2-4s: Character wave gesture
 * - 4-6s: Chat area appears with welcome message + topic chips
 * - 15s: No interaction → character tilts head (visual nudge)
 * - 30s: No interaction → character idle motion (I'm still here)
 *
 * The hook tracks whether the user has interacted and provides
 * timeline markers for the UI to respond to.
 */

// ── Timeline delays (ms) ──
const GREETING_DELAY  =  2_000;  // Character wave gesture
const INVITING_DELAY  =  4_000;  // Chat area appears with welcome + chips
const NUDGE_DELAY     = 15_000;  // No interaction → character tilts head
const WAITING_DELAY   = 30_000;  // No interaction → idle "still here" motion

export type FirstMinutePhase =
  | "loading"     // 0-2s
  | "greeting"    // 2-4s: character wave
  | "inviting"    // 4-6s: chat area appears
  | "nudge"       // 15s: no interaction
  | "waiting"     // 30s: still here
  | "interacted"; // user sent a message

interface FirstMinuteState {
  phase: FirstMinutePhase;
  hasInteracted: boolean;
}

export function useFirstMinute(): FirstMinuteState {
  const [phase, setPhase] = useState<FirstMinutePhase>("loading");
  const [hasInteracted, setHasInteracted] = useState(false);
  const interactedRef = useRef(false);

  useEffect(() => {
    // Check if returning visitor
    const visitCount = parseInt(sessionStorage.getItem("ling-visit-count") || "0", 10);
    if (visitCount > 0) {
      setPhase("interacted");
      setHasInteracted(true);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // 2s: greeting phase
    timers.push(setTimeout(() => {
      if (!interactedRef.current) {
        setPhase("greeting");
        playGreetingSound(); // Sound interface placeholder
      }
    }, GREETING_DELAY));

    // 4s: inviting phase
    timers.push(setTimeout(() => {
      if (!interactedRef.current) setPhase("inviting");
    }, INVITING_DELAY));

    // 15s: nudge
    timers.push(setTimeout(() => {
      if (!interactedRef.current) setPhase("nudge");
    }, NUDGE_DELAY));

    // 30s: waiting
    timers.push(setTimeout(() => {
      if (!interactedRef.current) setPhase("waiting");
    }, WAITING_DELAY));

    // Listen for interaction
    const onInteract = () => {
      interactedRef.current = true;
      setHasInteracted(true);
      setPhase("interacted");
      // Mark interaction in localStorage for ExperimentBar
      window.dispatchEvent(new CustomEvent("ling-user-interacted"));
    };
    // { once: true } ensures the listener auto-removes after first fire,
    // preventing re-entrant dispatch since onInteract itself dispatches
    // the same event. Explicit cleanup still needed for the unmount case.
    window.addEventListener("ling-user-interacted", onInteract, { once: true });

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("ling-user-interacted", onInteract);
    };
  }, []);

  return { phase, hasInteracted };
}

/**
 * Sound interface placeholder — plays greeting sound when character waves.
 * Initially a no-op. Implement actual audio in the future.
 * Similar to Duolingo opening sound.
 */
export function playGreetingSound(): void {
  // Placeholder: implement audio playback here
  // e.g., new Audio('/sounds/greeting.mp3').play().catch(() => {});
}
