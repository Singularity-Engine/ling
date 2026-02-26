import { describe, it, expect } from 'vitest';
import { getMockStats, type SngxaiStats } from '../data/mock-sngxai-stats';

describe('Mock sngxai stats', () => {
  it('returns stats with required fields', () => {
    const stats: SngxaiStats = getMockStats();
    expect(stats.dayCount).toBeGreaterThan(0);
    expect(stats.revenue).toBeGreaterThanOrEqual(0);
    expect(stats.revenueGoal).toBeGreaterThan(0);
    expect(stats.watcherCount).toBeGreaterThan(0);
    expect(typeof stats.survivalPercent).toBe('number');
  });

  it('survivalPercent is revenue / revenueGoal * 100', () => {
    const stats = getMockStats();
    const expected = Math.round((stats.revenue / stats.revenueGoal) * 100);
    expect(stats.survivalPercent).toBe(expected);
  });
});
