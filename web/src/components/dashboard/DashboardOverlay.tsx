/**
 * DashboardOverlay — Glass morphism survival metrics panel.
 *
 * Expands from VitalsBar center click. Shows revenue, burn rate,
 * runway, and supporter count. Closes on Escape, click outside,
 * or re-click VitalsBar center.
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DashboardData } from "@/hooks/useDashboardData";
import styles from "./DashboardOverlay.module.css";

interface DashboardOverlayProps {
  open: boolean;
  onClose: () => void;
  data: DashboardData;
}

// Check reduced-motion preference at module level for Framer
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const overlayVariants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -20 },
  visible: { opacity: 1, y: 0 },
};

export const DashboardOverlay = memo(function DashboardOverlay({
  open,
  onClose,
  data,
}: DashboardOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

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
          aria-label="Dashboard"
          tabIndex={-1}
        >
          <div className={styles.grid}>
            {/* Revenue */}
            <div className={styles.metric}>
              <span className={styles.label}>Revenue</span>
              <span className={styles.value}>
                ${data.revenueUsd.toLocaleString()} / $
                {data.targetUsd.toLocaleString()}
              </span>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${data.progressPercent}%` }}
                />
              </div>
              <span className={styles.progressPercent}>
                {data.progressPercent.toFixed(1)}%
              </span>
            </div>

            {/* Burn Rate */}
            <div className={styles.metric}>
              <span className={styles.label}>Burn Rate</span>
              <span className={styles.value}>
                ${data.burnRate.toLocaleString()}/mo
              </span>
            </div>

            {/* Runway */}
            <div className={styles.metric}>
              <span className={styles.label}>Runway</span>
              <span className={styles.value}>
                ~{data.runwayDays.toFixed(1)} days
              </span>
            </div>

            {/* Supporters */}
            <div className={styles.metric}>
              <span className={styles.label}>Supporters</span>
              <span className={styles.value}>{data.supporterCount}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
