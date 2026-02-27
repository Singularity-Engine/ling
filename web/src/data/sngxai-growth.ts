import statusData from './live/status.json';

export interface GrowthData {
  /** Daily cumulative revenue data points */
  revenueHistory: number[];
  label: string;
  lastUpdated: string;
}

/**
 * Live growth data derived from status.json.
 * Currently generates a synthetic curve from total_burned_usd over day_number days.
 * When daily historical data becomes available, replace with real time series.
 */
export function getLiveGrowth(): GrowthData {
  const days = statusData.day_number;
  const totalRevenue = statusData.revenue.total_usd;
  const totalBurned = statusData.costs.total_burned_usd;

  // Generate realistic daily cumulative curve
  // Even at $0 revenue, we show the burn (costs accumulating) as survival metric
  const history: number[] = [];
  const dailyBurn = totalBurned / Math.max(days, 1);

  for (let i = 0; i < days; i++) {
    // Revenue curve: slow start, may be zero
    const revProgress = days > 1 ? i / (days - 1) : 0;
    const revPoint = totalRevenue * Math.pow(revProgress, 1.5); // concave up curve

    // Cost curve: roughly linear
    const costPoint = dailyBurn * (i + 1);

    history.push(parseFloat(costPoint.toFixed(2)));
  }

  return {
    revenueHistory: history,
    label: totalRevenue > 0 ? 'Cumulative revenue ($)' : 'Cumulative cost ($)',
    lastUpdated: statusData.updated_at,
  };
}
