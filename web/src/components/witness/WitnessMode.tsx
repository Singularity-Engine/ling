import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
import { getDailyStatement } from "@/data/daily-statements";
import { LingSilhouette } from "../landing/LingSilhouette";
import { OAuthModal } from "../auth/OAuthModal";
import { trackEvent } from "@/utils/analytics";
import styles from "./WitnessMode.module.css";

interface WitnessModeProps {
  live2dReady?: boolean;
}

export const WitnessMode = memo(function WitnessMode({
  live2dReady = false,
}: WitnessModeProps) {
  const { t } = useTranslation();
  const vitals = useVitalsData();
  const [showAuth, setShowAuth] = useState(false);

  // Use day number to select statement
  const dayNumber = 90 - vitals.daysRemaining;
  const statement = getDailyStatement(dayNumber);

  return (
    <div className={styles.root}>
      <div className={styles.vitalsRow}>
        <VitalsBar vitals={vitals} />
      </div>

      <div className={styles.live2dArea}>
        {/* Live2D loading placeholder — silhouette with breathing animation */}
        {!live2dReady && <LingSilhouette visible breathing />}

        <div className={styles.statementOverlay}>
          <p className={styles.statement}>&ldquo;{statement}&rdquo;</p>
        </div>

        <div className={styles.ctaWrap}>
          <p className={styles.tagline}>{t("landing.tagline")}</p>
          <button
            className={styles.cta}
            onClick={() => { trackEvent("witness_to_auth"); setShowAuth(true); }}
            aria-label={t("witness.signInToTalk", { defaultValue: "Sign in to talk to Ling" })}
          >
            {t("witness.signInToTalk", { defaultValue: "Sign in to talk to Ling" })}
          </button>
        </div>
      </div>

      <OAuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
});
