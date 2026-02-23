import { memo, type CSSProperties } from "react";

const DOT_COLORS = [
  "linear-gradient(135deg, #a78bfa, #8b5cf6)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
];

// ─── Static style constants (avoid per-render allocation) ───

const S_WRAP_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "4px 2px",
  filter: "drop-shadow(0 1px 3px rgba(139, 92, 246, 0.25))",
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
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: DOT_COLORS[i],
  animation: `thinkingDot 1.4s ease-in-out ${i * 0.2}s infinite`,
}));

interface TypingIndicatorProps {
  /** When true, plays fade-out animation before removal */
  fadeOut?: boolean;
}

export const TypingIndicator = memo(({ fadeOut }: TypingIndicatorProps) => {
  return (
    <div style={fadeOut ? S_WRAP_OUT : S_WRAP_IN}>
      {DOT_INDICES.map((i) => (
        <div key={i} style={S_DOTS[i]} />
      ))}
    </div>
  );
});

TypingIndicator.displayName = "TypingIndicator";
