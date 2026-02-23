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
import { useAiStateRead, AiStateEnum } from '@/context/ai-state-context';
import { useAffinityState } from '@/context/affinity-context';
import { getIdleExpression, EXPRESSION_TRANSITION } from '@/config/expression-presets';
import { createLogger } from '@/utils/logger';

const log = createLogger('Affinity');

export function useAffinityIdleExpression() {
  const { aiState } = useAiStateRead();
  const { level } = useAffinityState();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Clean up any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    if (aiState !== AiStateEnum.IDLE) return;

    const expression = getIdleExpression(level);
    if (expression == null) return; // null = keep the default neutral

    // Override idle expression after a short delay
    timerRef.current = setTimeout(() => {
      const lappAdapter = window.getLAppAdapter?.();
      if (!lappAdapter) return;

      try {
        if (typeof expression === 'string') {
          lappAdapter.setExpression(expression);
        } else {
          const name = lappAdapter.getExpressionName(expression);
          if (name) lappAdapter.setExpression(name);
        }
        log.debug('Idle expression set to', expression, '(level:', level + ')');
      } catch (e) {
        log.error('Failed to set idle expression:', e);
      }
    }, EXPRESSION_TRANSITION.idleOverrideDelay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [aiState, level]);
}
