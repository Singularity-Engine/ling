/**
 * DashboardOverlay — Glass morphism survival metrics panel.
 *
 * Expands from VitalsBar center click. Shows revenue, burn rate,
 * runway, and supporter count. Closes on Escape, click outside,
 * or re-click VitalsBar center.
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import type { DashboardData } from "@/hooks/useDashboardData";
import { prefersReducedMotion } from "@/utils/reduced-motion";
import styles from "./DashboardOverlay.module.css";

interface DashboardOverlayProps {
  open: boolean;
  onClose: () => void;
  data: DashboardData;
}

export const DashboardOverlay = memo(function DashboardOverlay({
  open,
  onClose,
  data,
}: DashboardOverlayProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);

  const overlayVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion() ? 0 : -20 },
    visible: { opacity: 1, y: 0 },
  };

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Focus overlay when opened so keyboard events work
  useEffect(() => {
    if (open && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [open]);

  // Click-outside: close when clicking the backdrop area (not the grid content)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className={styles.overlay}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={overlayVariants}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-label={t("experiment.dashboardLabel", { defaultValue: "Dashboard" })}
          tabIndex={-1}
        >
          <div className={styles.grid}>
            {/* Revenue */}
            <div className={styles.metric}>
              <span className={styles.label}>{t("vitals.revenue", { defaultValue: "Revenue" })}</span>
              <span className={styles.value}>
                ${data.revenueUsd.toLocaleString()} / $
                {data.targetUsd.toLocaleString()}
              </span>
              <div
                className={styles.progressBar}
                role="progressbar"
                aria-valuenow={Math.round(data.progressPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("experiment.revenueProgress", { defaultValue: "Monthly revenue progress" })}
              >
                <div
                  className={styles.progressFill}
                  style={{ transform: `scaleX(${data.progressPercent / 100})` }}
                />
              </div>
              <span className={styles.progressPercent}>
                {data.progressPercent.toFixed(1)}%
              </span>
            </div>

            {/* Burn Rate */}
            <div className={styles.metric}>
              <span className={styles.label}>{t("vitals.burnRate", { defaultValue: "Burn Rate" })}</span>
              <span className={styles.value}>
                ${data.burnRate.toLocaleString()}{t("vitals.perMonth", { defaultValue: "/mo" })}
              </span>
            </div>

            {/* Runway */}
            <div className={styles.metric}>
              <span className={styles.label}>{t("vitals.runway", { defaultValue: "Runway" })}</span>
              <span className={styles.value}>
                ~{data.runwayDays.toFixed(1)} {t("vitals.daysUnit", { defaultValue: "days" })}
              </span>
            </div>

            {/* Supporters */}
            <div className={styles.metric}>
              <span className={styles.label}>{t("vitals.supporters", { defaultValue: "Supporters" })}</span>
              <span className={styles.value}>{data.supporterCount}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
