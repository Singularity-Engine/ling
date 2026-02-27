import statusData from './live/status.json';

export interface SngxaiStats {
  dayCount: number;
  revenue: number;
  revenueGoal: number;
  survivalPercent: number;
  watcherCount: number;
  revenueChangeToday: number;
  watcherChangeToday: number;
  lastUpdated: string;
}

/**
 * Live stats derived from real status.json
 * Source: sngxai-platform/infra/landing/api/status.json
 * Updated by: ling-finder/update_landing.py (every heartbeat ~3h)
 */
export function getLiveStats(): SngxaiStats {
  const revenue = statusData.revenue.total_usd;
  const revenueGoal = statusData.revenue.target_monthly_usd;
  return {
    dayCount: statusData.day_number,
    revenue,
    revenueGoal,
    survivalPercent: revenueGoal > 0 ? Math.round((revenue / revenueGoal) * 100) : 0,
    watcherCount: statusData.metrics.total_conversations,
    revenueChangeToday: 0, // derived from daily delta when historical data available
    watcherChangeToday: statusData.metrics.visitors_today,
    lastUpdated: statusData.updated_at,
  };
}
