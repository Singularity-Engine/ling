/**
 * Expression Preset System
 *
 * Defines baseline (idle) expressions per affinity level.
 * When AI enters IDLE state, the model shows the expression mapped to the
 * current affinity level instead of always reverting to neutral.
 *
 * Available expressions for Ling (mao_pro model):
 *   kaixin  (开心)  — happy / smiling
 *   shangxin(伤心)  — sad
 *   haixiu  (害羞)  — shy / blushing
 *   heilian (黑脸)  — angry / cold face
 *   tuosai  (拓塞)  — thinking / pondering
 *   chayao  (茶腰)  — confident
 *   shuijiao(困)    — sleepy
 *   0               — neutral (first expression / default)
 */

// ─── Types ───────────────────────────────────────────────────────

/** Expression identifier: a named expression string or a numeric index */
export type ExpressionId = string | number;

/** Preset for a single affinity level */
export interface AffinityExpressionPreset {
  /** Expression to show when idle at this affinity level. `null` = keep model default. */
  idle: ExpressionId | null;
}

/** Full preset map keyed by affinity level name */
export type AffinityExpressionPresetMap = Record<string, AffinityExpressionPreset>;

// ─── Preset Data ─────────────────────────────────────────────────

/**
 * Maps each affinity level to its baseline idle expression.
 *
 * Design rationale (from Live2D expression research):
 * - hatred / hostile  → heilian (cold face) — visual hostility
 * - indifferent       → null (neutral default) — no particular feeling
 * - neutral           → null (neutral default)
 * - friendly          → kaixin (happy) — warm and open
 * - close             → haixiu (shy/blushing) — affectionate closeness
 * - devoted           → kaixin (happy) — beaming with devotion
 */
export const AFFINITY_EXPRESSION_PRESETS: AffinityExpressionPresetMap = {
  hatred:      { idle: 'heilian' },
  hostile:     { idle: 'heilian' },
  indifferent: { idle: null },
  neutral:     { idle: null },
  friendly:    { idle: 'kaixin' },
  close:       { idle: 'haixiu' },
  devoted:     { idle: 'kaixin' },
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Look up the idle expression for a given affinity level.
 * Returns `null` when the model should use its default expression.
 */
export function getIdleExpression(level: string): ExpressionId | null {
  return AFFINITY_EXPRESSION_PRESETS[level]?.idle ?? null;
}
