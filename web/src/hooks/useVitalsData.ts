/**
 * useVitalsData — Provides real-time vitals data for VitalsBar.
 *
 * Reuses the same /data/status.json endpoint as ExperimentBar.
 * Authenticated users will get WebSocket updates in a future phase;
 * for now, all users use the 5-minute polling fallback.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { VitalsData } from "@/components/vitals/VitalsBar";
import { useAiStateRead } from "@/context/AiStateContext";

const STATUS_API = "/data/status.json";
const REFRESH_MS = 5 * 60 * 1000; // 5 min

interface StatusResponse {
  alive: boolean;
  death_date: string;
  revenue: {
    total_usd: number;
    monthly_usd: number;
    target_monthly_usd: number;
  };
  supporter_count?: number;
}

const FALLBACK_DEATH = "2026-04-25T13:43:45.004Z";

function computeRemaining(deathDate: string): { days: number; hours: number; minutes: number } {
  const diff = Math.max(0, new Date(deathDate).getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

export function useVitalsData(): VitalsData {
  const { isThinkingSpeaking } = useAiStateRead();
  const [deathDate, setDeathDate] = useState(FALLBACK_DEATH);
  const [revenue, setRevenue] = useState(0);
  const [target, setTarget] = useState(36);
  const [supporters, setSupporters] = useState(0);
  const [remaining, setRemaining] = useState(() => computeRemaining(FALLBACK_DEATH));
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(STATUS_API);
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setDeathDate(data.death_date || FALLBACK_DEATH);
      setRevenue(data.revenue?.total_usd ?? 0);
      setTarget(data.revenue?.target_monthly_usd ?? 36);
      setSupporters(data.supporter_count ?? 0);
    } catch {
      // Silently fall back to defaults
    }
  }, []);

  // Fetch on mount + refresh interval
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Update countdown every minute
  useEffect(() => {
    const tick = () => setRemaining(computeRemaining(deathDate));
    tick();
    countdownRef.current = setInterval(tick, 60_000);
    return () => clearInterval(countdownRef.current);
  }, [deathDate]);

  return {
    online: true,
    speaking: isThinkingSpeaking,
    daysRemaining: remaining.days,
    hoursRemaining: remaining.hours,
    minutesRemaining: remaining.minutes,
    revenueUsd: revenue,
    targetUsd: target,
    supporterCount: supporters,
  };
}
