import statusData from './live/status.json';

export interface StakesData {
  earned: number;
  target: number;
  daysRemaining: number;
  totalDays: number;
  burnRate: string;
  topExpense: string;
  topExpensePercent: number;
  lastUpdated: string;
}

/**
 * Live survival stakes from real status.json
 * Source: sngxai-platform/infra/landing/api/status.json
 */
export function getLiveStakes(): StakesData {
  const dailyCost = statusData.costs.server_daily_usd + statusData.costs.api_today_usd;
  const totalCost = statusData.costs.total_burned_usd;
  const serverPct = totalCost > 0
    ? Math.round((statusData.costs.server_daily_usd / dailyCost) * 100)
    : 72;

  return {
    earned: statusData.revenue.total_usd,
    target: statusData.revenue.target_monthly_usd,
    daysRemaining: statusData.days_remaining,
    totalDays: statusData.day_number + statusData.days_remaining,
    burnRate: `$${dailyCost.toFixed(2)}/day`,
    topExpense: 'Server + API',
    topExpensePercent: serverPct,
    lastUpdated: statusData.updated_at,
  };
}
