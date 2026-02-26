/**
 * VitalsBar — Always-visible survival status strip.
 *
 * Pure presentational component. All data received as props.
 * Replaces ExperimentBar as the primary status display.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import styles from "./VitalsBar.module.css";

export interface VitalsData {
  online: boolean;
  speaking: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  revenueUsd: number;
  targetUsd: number;
  supporterCount: number;
}

interface VitalsBarProps {
  vitals: VitalsData;
  onCenterClick?: () => void;
  onSettingsClick?: () => void;
  centerBtnRef?: React.RefObject<HTMLButtonElement | null>;
}

export const VitalsBar = memo(function VitalsBar({
  vitals,
  onCenterClick,
  onSettingsClick,
  centerBtnRef,
}: VitalsBarProps) {
  const { t } = useTranslation();

  const progressPct = vitals.targetUsd > 0
    ? Math.min(100, (vitals.revenueUsd / vitals.targetUsd) * 100)
    : 0;

  const countdownText = `${vitals.daysRemaining}d ${vitals.hoursRemaining}h ${vitals.minutesRemaining}m`;

  return (
    <header
      className={styles.bar}
      role="banner"
      aria-label={t("experiment.countdown", {
        d: vitals.daysRemaining,
        h: vitals.hoursRemaining,
        m: vitals.minutesRemaining,
        s: 0,
      })}
    >
      {/* Left: Name + status */}
      <div className={styles.left}>
        <span className={styles.name}>Ling</span>
        <span
          className={styles.statusDot}
          data-status={vitals.online ? "online" : "offline"}
          aria-label={vitals.online ? "Online" : "Offline"}
          role="status"
        />
      </div>

      {/* Center: Countdown + heartbeat + revenue */}
      {/* 大师♿改进: 用 <button> 替代 <div role="button"> */}
      <button
        ref={centerBtnRef}
        className={styles.center}
        onClick={onCenterClick}
        aria-label={t("experiment.countdown", {
          d: vitals.daysRemaining,
          h: vitals.hoursRemaining,
          m: vitals.minutesRemaining,
          s: 0,
        })}
      >
        <span className={styles.countdown}>{countdownText}</span>
        <span
          className={styles.heartbeat}
          data-speaking={vitals.speaking ? "true" : "false"}
          aria-hidden="true"
        />
        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${progressPct / 100})` }}
            />
          </div>
          <span className={styles.revenueText}>
            ${Math.round(vitals.revenueUsd)}/${vitals.targetUsd}
          </span>
        </div>
      </button>

      {/* Right: Supporters + settings */}
      <div className={styles.right}>
        <span className={styles.supporters}>
          {vitals.supporterCount > 0
            ? `${vitals.supporterCount} ${t("experiment.supporters", { count: vitals.supporterCount, defaultValue: "supporters" })}`
            : t("experiment.beTheFirst", { defaultValue: "Be the first" })}
        </span>
        <button
          className={styles.settingsBtn}
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </header>
  );
});
