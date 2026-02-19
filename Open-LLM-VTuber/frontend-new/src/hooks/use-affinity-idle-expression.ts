/**
 * Affinity-based Idle Expression
 *
 * When AI enters IDLE state, the default resetExpression sets expression to
 * neutral (index 0). This hook overrides the idle expression based on the
 * current affinity level — higher affinity shows warmer expressions,
 * lower affinity shows colder ones.
 *
 * Runs with a small delay after IDLE to ensure it fires after the
 * default resetExpression in live2d.tsx.
 */

import { useEffect, useRef } from 'react';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';
import { useAffinity } from '@/context/affinity-context';

/**
 * Maps affinity level → Live2D expression name/index.
 *
 * Available expressions for Ling:
 *   kaixin (开心), shangxin (伤心), haixiu (害羞),
 *   heilian (黑脸), tuosai (拓塞), chayao (茶腰),
 *   shuijiao (困), 0 (neutral)
 */
const LEVEL_IDLE_EXPRESSION: Record<string, string | number | null> = {
  hatred:      'heilian',   // 黑脸 — cold/hostile face
  hostile:     'heilian',   // 黑脸
  indifferent: null,        // keep default neutral
  neutral:     null,        // keep default neutral
  friendly:    'kaixin',    // 开心 — smiling
  close:       'haixiu',    // 害羞 — blushing/shy (affectionate)
  devoted:     'kaixin',    // 开心 — beaming
};

/** Delay (ms) to ensure this fires after live2d.tsx resetExpression */
const OVERRIDE_DELAY_MS = 150;

export function useAffinityIdleExpression() {
  const { aiState } = useAiState();
  const { level } = useAffinity();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Clean up any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    if (aiState !== AiStateEnum.IDLE) return;

    const expression = LEVEL_IDLE_EXPRESSION[level];
    if (expression == null) return; // null = keep the default neutral

    // Override idle expression after a short delay
    timerRef.current = setTimeout(() => {
      const lappAdapter = (window as any).getLAppAdapter?.();
      if (!lappAdapter) return;

      try {
        if (typeof expression === 'string') {
          lappAdapter.setExpression(expression);
        } else {
          const name = lappAdapter.getExpressionName(expression);
          if (name) lappAdapter.setExpression(name);
        }
        if (import.meta.env.DEV) console.log(`[Affinity] Idle expression set to "${expression}" (level: ${level})`);
      } catch (e) {
        console.warn('[Affinity] Failed to set idle expression:', e);
      }
    }, OVERRIDE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [aiState, level]);
}
