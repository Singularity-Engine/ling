/**
 * Expression Preset Configuration System
 *
 * Based on T705 Live2D expression research:
 * - Model has 9 expressions, all using single-parameter Add mode (Param35~Param54)
 * - Each expression controls a different parameter → naturally stackable
 * - Expressions: kaixin, shangxin, haixiu, heilian, tuosai, chayao, shuijiao, weixiao, jingya
 *
 * This file provides:
 * 1. Full expression catalog with metadata
 * 2. Affinity level → idle expression mapping
 * 3. Emotion keyword → expression mapping (EN/ZH)
 * 4. Expression transition helpers
 */

// ─── Expression Catalog ─────────────────────────────────────────

export interface ExpressionMeta {
  /** Live2D expression name (matches .exp3.json) */
  name: string;
  /** Display label (Chinese) */
  label: string;
  /** Description */
  description: string;
  /** Controlling parameter (from T705 research) */
  param: string;
  /** Whether this expression supports blending with others */
  stackable: boolean;
}

/**
 * Complete expression catalog for the Ling model (mao_pro).
 * All use single-parameter Add mode → stackable = true.
 */
export const EXPRESSION_CATALOG: ExpressionMeta[] = [
  { name: 'kaixin',   label: '开心', description: 'Happy / smiling',       param: 'Param35', stackable: true },
  { name: 'shangxin', label: '伤心', description: 'Sad',                   param: 'Param37', stackable: true },
  { name: 'haixiu',   label: '害羞', description: 'Shy / blushing',        param: 'Param39', stackable: true },
  { name: 'heilian',  label: '黑脸', description: 'Angry / cold face',     param: 'Param41', stackable: true },
  { name: 'tuosai',   label: '托腮', description: 'Thinking / pondering',  param: 'Param43', stackable: true },
  { name: 'chayao',   label: '叉腰', description: 'Confident / hands on hips', param: 'Param45', stackable: true },
  { name: 'shuijiao', label: '困',   description: 'Sleepy',                param: 'Param47', stackable: true },
  { name: 'weixiao',  label: '微笑', description: 'Gentle smile',          param: 'Param49', stackable: true },
  { name: 'jingya',   label: '惊讶', description: 'Surprised',             param: 'Param54', stackable: true },
];

/** Quick lookup by expression name */
export const EXPRESSION_MAP = new Map(
  EXPRESSION_CATALOG.map(e => [e.name, e])
);

// ─── Types ──────────────────────────────────────────────────────

export type ExpressionId = string | number;

export interface AffinityExpressionPreset {
  /** Primary idle expression. `null` = model default (neutral). */
  idle: ExpressionId | null;
  /** Optional secondary expression to blend (stackable). */
  blend?: ExpressionId | null;
}

export type AffinityExpressionPresetMap = Record<string, AffinityExpressionPreset>;

// ─── Affinity → Idle Expression Presets ─────────────────────────

/**
 * Maps each affinity level to its baseline idle expression(s).
 *
 * Design rationale:
 * - hatred / hostile  → heilian (cold face) — visual hostility
 * - indifferent       → null (neutral default)
 * - neutral           → null (neutral default)
 * - friendly          → weixiao (gentle smile) — approachable warmth
 * - close             → haixiu (shy/blushing) — affectionate closeness
 * - devoted           → kaixin (happy) — beaming with devotion
 */
export const AFFINITY_EXPRESSION_PRESETS: AffinityExpressionPresetMap = {
  hatred:      { idle: 'heilian' },
  hostile:     { idle: 'heilian' },
  indifferent: { idle: null },
  neutral:     { idle: null },
  friendly:    { idle: 'weixiao' },
  close:       { idle: 'haixiu' },
  devoted:     { idle: 'kaixin' },
};

// ─── Emotion Keyword → Expression Mapping ───────────────────────

/**
 * Resolves emotion keywords (from AI or Gateway) to Live2D expression names.
 * Supports both English and Chinese keywords.
 */
export const EMOTION_EXPRESSION_MAP: Record<string, string> = {
  // English
  happy: 'kaixin',
  sad: 'shangxin',
  shy: 'haixiu',
  angry: 'heilian',
  thinking: 'tuosai',
  confident: 'chayao',
  sleepy: 'shuijiao',
  smile: 'weixiao',
  surprised: 'jingya',
  // Chinese
  开心: 'kaixin',
  伤心: 'shangxin',
  害羞: 'haixiu',
  生气: 'heilian',
  思考: 'tuosai',
  自信: 'chayao',
  困: 'shuijiao',
  微笑: 'weixiao',
  惊讶: 'jingya',
};

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Look up the idle expression for a given affinity level.
 * Returns `null` when the model should use its default expression.
 */
export function getIdleExpression(level: string): ExpressionId | null {
  return AFFINITY_EXPRESSION_PRESETS[level]?.idle ?? null;
}

/**
 * Look up the blend expression for a given affinity level.
 * Returns `null` when no blending is desired.
 */
export function getBlendExpression(level: string): ExpressionId | null {
  return AFFINITY_EXPRESSION_PRESETS[level]?.blend ?? null;
}

/**
 * Resolve an emotion keyword to a Live2D expression name.
 * Returns the keyword itself if it's already a valid expression name.
 */
export function resolveEmotionExpression(keyword: string): string | null {
  if (EXPRESSION_MAP.has(keyword)) return keyword;
  return EMOTION_EXPRESSION_MAP[keyword] ?? null;
}

/** Transition timing presets (ms) */
export const EXPRESSION_TRANSITION = {
  /** Delay before overriding idle expression (must fire after live2d.tsx resetExpression) */
  idleOverrideDelay: 150,
  /** Fade duration for smooth expression blending */
  fadeDuration: 300,
} as const;
