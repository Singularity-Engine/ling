import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
import { getDailyStatement } from "@/data/daily-statements";
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
        {/* Live2D loading placeholder */}
        {!live2dReady && (
          <div aria-hidden="true" style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--ling-accent-20, rgba(139,92,246,0.2))',
            borderTopColor: 'var(--ling-accent, #8B5CF6)',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}

        {/* NOTE: actual Live2D canvas is rendered by the existing Live2D component
            in the provider tree. For Witness Mode, we show the silhouette as a
            standalone visual. The actual Live2D integration will be wired in Task 10. */}

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
