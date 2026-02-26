/**
 * useDashboardData — Extended vitals data for Dashboard Overlay.
 *
 * Wraps useVitalsData() and computes additional dashboard-specific fields
 * (burn rate, runway, progress percent). No separate fetch needed.
 */

import { useMemo } from "react";
import { useVitalsData } from "./useVitalsData";

export interface DashboardData {
  // From existing useVitalsData
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  revenueUsd: number;
  targetUsd: number;
  supporterCount: number;
  online: boolean;
  speaking: boolean;
  // Dashboard-specific (computed)
  burnRate: number;        // monthly burn rate USD (default 3000)
  runwayDays: number;      // computed: (revenueUsd / burnRate * 30) remaining
  progressPercent: number; // revenueUsd / targetUsd * 100
}

const DEFAULT_BURN_RATE = 3000;

export function useDashboardData(): DashboardData {
  const vitals = useVitalsData();

  return useMemo<DashboardData>(() => {
    const burnRate = DEFAULT_BURN_RATE;
    const runwayDays = burnRate > 0 ? (vitals.revenueUsd / burnRate) * 30 : 0;
    const progressPercent =
      vitals.targetUsd > 0
        ? Math.min(100, (vitals.revenueUsd / vitals.targetUsd) * 100)
        : 0;

    return {
      ...vitals,
      burnRate,
      runwayDays,
      progressPercent,
    };
  }, [vitals]);
}
