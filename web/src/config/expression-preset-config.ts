/**
 * 表情预设配置 — 定义情感到 Live2D 表情的映射关系
 * 当前模型（灵）采用开关式设计：每个表情 = 独立参数 0→1
 */

export type Live2DExpressionName =
  | 'kaixin' | 'shangxin' | 'haixiu' | 'heilian'
  | 'tuosai' | 'chayao' | 'shuijiao' | 'weixiao' | 'mogui';

export interface EmotionPreset {
  expression: Live2DExpressionName;
  fadeInMs?: number;
  fadeOutMs?: number;
  minAffinityLevel?: number;
}

export interface AffinityBaseline {
  level: number;
  idleExpression: Live2DExpressionName | null;
  description: string;
}

export const EMOTION_PRESETS: Record<string, EmotionPreset> = {
  happy: { expression: 'kaixin' }, joy: { expression: 'kaixin' }, excited: { expression: 'kaixin' },
  开心: { expression: 'kaixin' }, 高兴: { expression: 'kaixin' }, 兴奋: { expression: 'kaixin' },
  smile: { expression: 'weixiao' }, gentle: { expression: 'weixiao' },
  微笑: { expression: 'weixiao' }, 温柔: { expression: 'weixiao' },
  confident: { expression: 'chayao' }, proud: { expression: 'chayao' },
  自信: { expression: 'chayao' }, 骄傲: { expression: 'chayao' },
  shy: { expression: 'haixiu' }, embarrassed: { expression: 'haixiu' },
  害羞: { expression: 'haixiu' }, 不好意思: { expression: 'haixiu' },
  sad: { expression: 'shangxin' }, disappointed: { expression: 'shangxin' },
  伤心: { expression: 'shangxin' }, 难过: { expression: 'shangxin' }, 失望: { expression: 'shangxin' },
  angry: { expression: 'heilian' }, frustrated: { expression: 'heilian' }, annoyed: { expression: 'heilian' },
  生气: { expression: 'heilian' }, 烦躁: { expression: 'heilian' },
  thinking: { expression: 'tuosai' }, pondering: { expression: 'tuosai' }, curious: { expression: 'tuosai' },
  思考: { expression: 'tuosai' }, 好奇: { expression: 'tuosai' },
  sleepy: { expression: 'shuijiao' }, tired: { expression: 'shuijiao' },
  困: { expression: 'shuijiao' }, 累: { expression: 'shuijiao' },
  mischievous: { expression: 'mogui' }, playful: { expression: 'mogui' },
  调皮: { expression: 'mogui' }, 邪恶: { expression: 'mogui' },
  neutral: { expression: 'weixiao' }, calm: { expression: 'weixiao' }, 平静: { expression: 'weixiao' },
};

export const AFFINITY_BASELINES: AffinityBaseline[] = [
  { level: 1, idleExpression: null, description: '初识' },
  { level: 2, idleExpression: null, description: '熟悉' },
  { level: 3, idleExpression: 'weixiao', description: '亲近' },
  { level: 4, idleExpression: 'weixiao', description: '信任' },
  { level: 5, idleExpression: 'kaixin', description: '挚友' },
];

export function getEmotionPreset(emotion: string): EmotionPreset | null {
  return EMOTION_PRESETS[emotion] ?? EMOTION_PRESETS[emotion.toLowerCase()] ?? null;
}

export function getAffinityBaseline(level: number): AffinityBaseline {
  const clamped = Math.max(1, Math.min(level, AFFINITY_BASELINES.length));
  return AFFINITY_BASELINES[clamped - 1];
}
