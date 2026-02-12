/**
 * Frontend Affinity Engine
 *
 * Computes affinity (好感度) purely on the client side so that the
 * Demo always shows a living, evolving relationship bar — even when
 * the backend doesn't emit affinity events.
 *
 * If the backend *does* send `affinity-update`, the engine switches
 * to backend-driven mode and stops its own calculations.
 */

import { useEffect, useRef } from 'react';
import { gatewayAdapter } from '@/services/gateway-message-adapter';

// ─── Constants ────────────────────────────────────────────────────

const STORAGE_KEY = 'ling-affinity-state';
const INITIAL_AFFINITY = 30; // 初次见面
const MIN_AFFINITY = 0;
const MAX_AFFINITY = 100;

/** Points awarded per event */
const POINTS = {
  userMessage: 1.5,       // user sends a message
  aiReply: 0.5,           // AI finishes a reply
  streakBonus: 1,         // extra bonus for sustained conversation (within 5 min)
} as const;

/** Streak window — interactions within this interval count as consecutive */
const STREAK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── Level mapping ────────────────────────────────────────────────

interface LevelDef {
  min: number;
  max: number;
  level: string;
}

const LEVELS: LevelDef[] = [
  { min: 0,  max: 15,  level: 'hatred' },
  { min: 15, max: 30,  level: 'hostile' },
  { min: 30, max: 45,  level: 'indifferent' },
  { min: 45, max: 55,  level: 'neutral' },
  { min: 55, max: 70,  level: 'friendly' },
  { min: 70, max: 85,  level: 'close' },
  { min: 85, max: 101, level: 'devoted' },
];

function getLevel(affinity: number): string {
  for (const def of LEVELS) {
    if (affinity >= def.min && affinity < def.max) return def.level;
  }
  return 'neutral';
}

// ─── Milestone messages ───────────────────────────────────────────

const LEVEL_MILESTONES: Record<string, string> = {
  hostile:     '灵对你还有些警惕...',
  indifferent: '灵开始注意到你了',
  neutral:     '灵对你的态度变得平和了',
  friendly:    '灵觉得你是个不错的人！',
  close:       '灵觉得和你越来越亲近了...',
  devoted:     '灵对你全心全意 💕',
};

// ─── Persisted state shape ────────────────────────────────────────

interface PersistedAffinity {
  affinity: number;
  lastInteractionTs: number;       // epoch ms
  reachedLevels: string[];         // levels that already triggered milestone
}

function loadState(): PersistedAffinity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAffinity;
      if (typeof parsed.affinity === 'number') return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return { affinity: INITIAL_AFFINITY, lastInteractionTs: 0, reachedLevels: [] };
}

function saveState(s: PersistedAffinity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* quota exceeded — silently ignore */ }
}

// ─── Hook ─────────────────────────────────────────────────────────

interface UseAffinityEngineOptions {
  updateAffinity: (affinity: number, level: string) => void;
  showMilestone: (message: string) => void;
}

/**
 * Call this hook once (e.g. inside AffinityProvider or WebSocketHandler).
 * It subscribes to `gatewayAdapter.message$` to detect user/AI messages
 * and gradually adjusts the affinity value.
 */
export function useAffinityEngine({ updateAffinity, showMilestone }: UseAffinityEngineOptions) {
  const stateRef = useRef<PersistedAffinity>(loadState());
  const backendDrivenRef = useRef(false);

  // Keep latest callbacks in refs to avoid re-subscribing
  const updateAffinityRef = useRef(updateAffinity);
  const showMilestoneRef = useRef(showMilestone);
  useEffect(() => { updateAffinityRef.current = updateAffinity; }, [updateAffinity]);
  useEffect(() => { showMilestoneRef.current = showMilestone; }, [showMilestone]);

  useEffect(() => {
    // On mount: push persisted affinity into context
    const initial = stateRef.current;
    updateAffinityRef.current(initial.affinity, getLevel(initial.affinity));

    // ── Core: apply delta and propagate ──────────────────────────

    function applyDelta(delta: number) {
      if (backendDrivenRef.current) return;

      const prev = stateRef.current;
      const prevLevel = getLevel(prev.affinity);
      const now = Date.now();

      // Streak bonus: if last interaction was within the window, add bonus
      let bonus = 0;
      if (prev.lastInteractionTs > 0 && now - prev.lastInteractionTs < STREAK_WINDOW_MS) {
        bonus = POINTS.streakBonus;
      }

      const raw = prev.affinity + delta + bonus;
      const clamped = Math.round(Math.max(MIN_AFFINITY, Math.min(MAX_AFFINITY, raw)) * 10) / 10;
      const newLevel = getLevel(clamped);

      const newState: PersistedAffinity = {
        affinity: clamped,
        lastInteractionTs: now,
        reachedLevels: [...prev.reachedLevels],
      };

      // Level change → milestone
      if (newLevel !== prevLevel) {
        const msg = LEVEL_MILESTONES[newLevel];
        if (msg && !newState.reachedLevels.includes(newLevel)) {
          newState.reachedLevels.push(newLevel);
          // Delay milestone slightly so the bar animates first
          setTimeout(() => showMilestoneRef.current(msg), 400);
        }
      }

      stateRef.current = newState;
      saveState(newState);
      updateAffinityRef.current(clamped, newLevel);
    }

    // ── Subscribe to message stream ─────────────────────────────

    const sub = gatewayAdapter.message$.subscribe((msg) => {
      // Backend-driven mode: if we ever receive a real affinity-update,
      // stop the frontend engine so both don't fight.
      if (msg.type === 'affinity-update') {
        backendDrivenRef.current = true;
        return;
      }

      if (backendDrivenRef.current) return;

      switch (msg.type) {
        // User sent a message → conversation-chain-start fires first,
        // but the actual user intent is captured when the chain starts.
        case 'control':
          if (msg.text === 'conversation-chain-start') {
            applyDelta(POINTS.userMessage);
          }
          break;

        // AI finished a complete reply
        case 'ai-message-complete':
          applyDelta(POINTS.aiReply);
          break;
      }
    });

    return () => sub.unsubscribe();
  }, []); // stable — subscribe once
}
