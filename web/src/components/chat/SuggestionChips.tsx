import { memo, useCallback, type CSSProperties } from "react";
import i18next from "i18next";

// ─── Style constants (avoid per-render allocation) ───

const S_CHIPS_CENTERED: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "8px",
  maxWidth: "min(340px, 100%)",
};

const S_CHIPS_LEFT: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  maxWidth: "min(340px, 100%)",
  padding: "4px 16px 12px",
};

const S_CHIP_BASE: CSSProperties = {
  background: "var(--ling-purple-15)",
  border: "1px solid var(--ling-purple-25)",
  borderRadius: "20px",
  padding: "8px 16px",
  color: "var(--ling-purple-text)",
  fontSize: "13px",
  cursor: "pointer",
  lineHeight: "1.4",
};

// Lazily-cached chip styles keyed by "baseDelay:index" — avoids spreading
// S_CHIP_BASE + computing animation on every SuggestionChips render.
const _chipCache = new Map<string, CSSProperties>();
function getChipStyle(baseDelay: number, index: number): CSSProperties {
  const key = `${baseDelay}:${index}`;
  let s = _chipCache.get(key);
  if (!s) {
    s = { ...S_CHIP_BASE, animation: `chipFadeIn 0.4s ease-out ${baseDelay + index * 0.08}s both` };
    _chipCache.set(key, s);
  }
  return s;
}

// ─── Component ───

export const SuggestionChips = memo(function SuggestionChips({
  chips,
  onChipClick,
  centered,
  baseDelay = 0,
}: {
  chips: string[];
  onChipClick: (text: string) => void;
  centered?: boolean;
  baseDelay?: number;
}) {
  // Single delegated handler — avoids creating N inline closures per render.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const text = e.currentTarget.dataset.chip;
      if (text) onChipClick(text);
    },
    [onChipClick],
  );

  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <div role="group" aria-label={i18next.t("ui.suggestedReplies")} style={centered ? S_CHIPS_CENTERED : S_CHIPS_LEFT}>
      {chips.map((chip, i) => (
        <button
          key={chip}
          className="welcome-chip"
          data-chip={chip}
          onClick={handleClick}
          style={getChipStyle(baseDelay, i)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
});
SuggestionChips.displayName = "SuggestionChips";
