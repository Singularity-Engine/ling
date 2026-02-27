import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SK_VISIT_COUNT,
  SK_FIRST_VISIT,
  SK_LAST_VISIT,
  SK_HAS_INTERACTED,
} from "@/constants/storage-keys";

export interface ReturnVisitInfo {
  /** True when this is a returning user (visited before + interacted) */
  isReturning: boolean;
  /** Hours since last visit (0 for first visit) */
  hoursSinceLastVisit: number;
  /** Days since first visit (0 for first visit) */
  daysSinceFirstVisit: number;
  /** Personalized welcome line for returning users */
  welcomeLine: string;
  /** Total visit count */
  visitCount: number;
}

/**
 * Detects returning users and generates a personalized welcome line.
 *
 * Reads SK_FIRST_VISIT + SK_LAST_VISIT + SK_VISIT_COUNT from localStorage
 * and updates SK_LAST_VISIT on mount.
 */
export function useReturnVisit(): ReturnVisitInfo {
  const { t } = useTranslation();

  return useMemo(() => {
    const now = Date.now();
    const visitCount = parseInt(localStorage.getItem(SK_VISIT_COUNT) || "0", 10);
    const hasInteracted = localStorage.getItem(SK_HAS_INTERACTED) === "1";
    const firstVisitStr = localStorage.getItem(SK_FIRST_VISIT);
    const lastVisitStr = localStorage.getItem(SK_LAST_VISIT);

    // Update last visit timestamp
    localStorage.setItem(SK_LAST_VISIT, new Date(now).toISOString());

    if (!hasInteracted || visitCount <= 1 || !firstVisitStr) {
      return {
        isReturning: false,
        hoursSinceLastVisit: 0,
        daysSinceFirstVisit: 0,
        welcomeLine: "",
        visitCount,
      };
    }

    const firstVisit = new Date(firstVisitStr).getTime();
    const lastVisit = lastVisitStr ? new Date(lastVisitStr).getTime() : firstVisit;
    const hoursSince = Math.floor((now - lastVisit) / 3_600_000);
    const daysSinceFirst = Math.floor((now - firstVisit) / 86_400_000);

    // Pick welcome line based on time elapsed
    let welcomeLine: string;
    if (hoursSince < 1) {
      welcomeLine = t("retention.welcomeBackJustNow");
    } else if (hoursSince < 24) {
      welcomeLine = t("retention.welcomeBackHours", { hours: hoursSince });
    } else {
      const days = Math.floor(hoursSince / 24);
      welcomeLine = t("retention.welcomeBackDays", { days });
    }

    return {
      isReturning: true,
      hoursSinceLastVisit: hoursSince,
      daysSinceFirstVisit: daysSinceFirst,
      welcomeLine,
      visitCount,
    };
  }, [t]);
}
