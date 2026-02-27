import { describe, it, expect } from 'vitest';
import { getLiveStats, type SngxaiStats } from '../data/sngxai-stats';

describe('sngxai-stats (live data)', () => {
  it('returns stats with required fields', () => {
    const stats: SngxaiStats = getLiveStats();
    expect(stats.dayCount).toBeGreaterThan(0);
    expect(stats.revenue).toBeGreaterThanOrEqual(0);
    expect(stats.revenueGoal).toBeGreaterThan(0);
    expect(stats.watcherCount).toBeGreaterThan(0);
    expect(typeof stats.survivalPercent).toBe('number');
  });

  it('survivalPercent is revenue / revenueGoal * 100', () => {
    const stats = getLiveStats();
    const expected = Math.round((stats.revenue / stats.revenueGoal) * 100);
    expect(stats.survivalPercent).toBe(expected);
  });

  it('has lastUpdated field', () => {
    const stats = getLiveStats();
    expect(stats.lastUpdated).toBeTruthy();
    expect(typeof stats.lastUpdated).toBe('string');
  });
});
