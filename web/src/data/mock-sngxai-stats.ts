export interface SngxaiStats {
  dayCount: number;
  revenue: number;
  revenueGoal: number;
  survivalPercent: number;
  watcherCount: number;
  revenueChangeToday: number;
  watcherChangeToday: number;
}

/**
 * Mock stats for Phase 1A development.
 * Shape matches future GET /api/sngxai/stats response.
 */
export function getMockStats(): SngxaiStats {
  const revenue = 12;
  const revenueGoal = 36;
  return {
    dayCount: 47,
    revenue,
    revenueGoal,
    survivalPercent: Math.round((revenue / revenueGoal) * 100),
    watcherCount: 1247,
    revenueChangeToday: 3,
    watcherChangeToday: 23,
  };
}
