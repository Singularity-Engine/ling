/**
 * Expression Preset Configuration
 *
 * Maps affinity levels to Live2D idle expressions and provides
 * transition timing presets.
 *
 * Based on T705 Live2D expression research:
 * - Model has 9 expressions, all using single-parameter Add mode
 * - Expressions: kaixin, shangxin, haixiu, heilian, tuosai, chayao, shuijiao, weixiao, jingya
 */

// ─── Types ──────────────────────────────────────────────────────

type ExpressionId = string | number;

interface AffinityExpressionPreset {
  /** Primary idle expression. `null` = model default (neutral). */
  idle: ExpressionId | null;
}

// ─── Affinity → Idle Expression Presets ─────────────────────────

/**
 * Maps each affinity level to its baseline idle expression.
 *
 * Design rationale:
 * - hatred / hostile  → heilian (cold face) — visual hostility
 * - indifferent       → null (neutral default)
 * - neutral           → null (neutral default)
 * - friendly          → weixiao (gentle smile) — approachable warmth
 * - close             → haixiu (shy/blushing) — affectionate closeness
 * - devoted           → kaixin (happy) — beaming with devotion
 */
const AFFINITY_EXPRESSION_PRESETS: Record<string, AffinityExpressionPreset> = {
  hatred:      { idle: 'heilian' },
  hostile:     { idle: 'heilian' },
  indifferent: { idle: null },
  neutral:     { idle: null },
  friendly:    { idle: 'weixiao' },
  close:       { idle: 'haixiu' },
  devoted:     { idle: 'kaixin' },
};

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Look up the idle expression for a given affinity level.
 * Returns `null` when the model should use its default expression.
 */
export function getIdleExpression(level: string): ExpressionId | null {
  return AFFINITY_EXPRESSION_PRESETS[level]?.idle ?? null;
}

/** Transition timing presets (ms) */
export const EXPRESSION_TRANSITION = {
  /** Delay before overriding idle expression (must fire after live2d.tsx resetExpression) */
  idleOverrideDelay: 150,
  /** Fade duration for smooth expression blending */
  fadeDuration: 300,
} as const;
