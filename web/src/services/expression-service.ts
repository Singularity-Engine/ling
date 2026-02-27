/**
 * 表情管理服务 — 统一管理 Live2D 表情的触发、切换和基线
 */
import { getEmotionPreset, getAffinityBaseline, type Live2DExpressionName, type EmotionPreset } from '../config/expression-preset-config';

export interface ExpressionState {
  current: Live2DExpressionName | null;
  baseline: Live2DExpressionName | null;
  lastChangeTime: number;
  affinityLevel: number;
}

class ExpressionService {
  private state: ExpressionState = { current: null, baseline: null, lastChangeTime: 0, affinityLevel: 1 };
  private readonly MIN_SWITCH_INTERVAL = 300;

  resolveEmotion(emotion: string): EmotionPreset | null {
    return getEmotionPreset(emotion);
  }

  recordExpressionChange(expression: Live2DExpressionName): void {
    this.state.current = expression;
    this.state.lastChangeTime = Date.now();
  }

  canSwitchExpression(): boolean {
    return Date.now() - this.state.lastChangeTime >= this.MIN_SWITCH_INTERVAL;
  }

  updateAffinityLevel(level: number): Live2DExpressionName | null {
    this.state.affinityLevel = level;
    const baseline = getAffinityBaseline(level);
    this.state.baseline = baseline.idleExpression;
    return this.state.baseline;
  }

  getIdleExpression(): Live2DExpressionName | null {
    return this.state.baseline;
  }

  getState(): Readonly<ExpressionState> {
    return { ...this.state };
  }
}

export const expressionService = new ExpressionService();
