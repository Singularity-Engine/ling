import { memo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

// ─── Constants ───

const DOT_SIZE = 8;            // px
const DOT_GAP = 6;             // px
const BOUNCE_DURATION_S = 1.4; // animation cycle
const BOUNCE_STAGGER_S = 0.2;  // delay between dots
const GRADIENT_ANGLE = 135;    // degrees

const DOT_COLORS = [
  `linear-gradient(${GRADIENT_ANGLE}deg, var(--ling-purple-light), var(--ling-purple))`,
  `linear-gradient(${GRADIENT_ANGLE}deg, var(--ling-purple), var(--ling-purple-deep))`,
  `var(--ling-purple-deep)`,
];

// ─── Static style constants (avoid per-render allocation) ───

const S_WRAP_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: `${DOT_GAP}px`,
  padding: "4px 2px",
  filter: "drop-shadow(0 1px 3px var(--ling-purple-25))",
};

const S_WRAP_IN: CSSProperties = {
  ...S_WRAP_BASE,
  animation: "typingFadeInUp 0.3s ease-out",
};

const S_WRAP_OUT: CSSProperties = {
  ...S_WRAP_BASE,
  animation: "thinkingFadeOut 0.25s ease-out forwards",
};

const DOT_INDICES = [0, 1, 2] as const;

const S_DOTS: CSSProperties[] = DOT_INDICES.map((i) => ({
  width: `${DOT_SIZE}px`,
  height: `${DOT_SIZE}px`,
  borderRadius: "50%",
  background: DOT_COLORS[i],
  animation: `thinkingDot ${BOUNCE_DURATION_S}s ease-in-out ${i * BOUNCE_STAGGER_S}s infinite`,
}));

interface TypingIndicatorProps {
  /** When true, plays fade-out animation before removal */
  fadeOut?: boolean;
}

export const TypingIndicator = memo(({ fadeOut }: TypingIndicatorProps) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-atomic="true"
      aria-label={t("chat.aiThinking")}
      style={fadeOut ? S_WRAP_OUT : S_WRAP_IN}
    >
      {DOT_INDICES.map((i) => (
        <div key={i} style={S_DOTS[i]} />
      ))}
    </div>
  );
});

TypingIndicator.displayName = "TypingIndicator";
