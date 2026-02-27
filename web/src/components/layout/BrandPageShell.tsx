import type { CSSProperties, ReactNode } from "react";

interface BrandPageShellProps {
  children: ReactNode;
  centered?: boolean;
  maxWidth?: number;
}

const S_ROOT: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: "100dvh",
  overflow: "hidden",
  background: "var(--ling-body-bg)",
  color: "var(--ling-body-color)",
};

const S_AURORA_BASE: CSSProperties = {
  position: "absolute",
  pointerEvents: "none",
  filter: "blur(2px)",
};

const S_AURORA_TOP_LEFT: CSSProperties = {
  ...S_AURORA_BASE,
  top: "-24%",
  left: "-16%",
  width: "58vw",
  height: "58vw",
  background: "radial-gradient(circle at 35% 35%, rgba(39, 201, 182, 0.32), rgba(39, 201, 182, 0) 70%)",
};

const S_AURORA_TOP_RIGHT: CSSProperties = {
  ...S_AURORA_BASE,
  top: "-20%",
  right: "-16%",
  width: "54vw",
  height: "54vw",
  background: "radial-gradient(circle at 62% 28%, rgba(255, 168, 118, 0.28), rgba(255, 168, 118, 0) 70%)",
};

const S_AURORA_BOTTOM: CSSProperties = {
  ...S_AURORA_BASE,
  bottom: "-34%",
  left: "20%",
  width: "72vw",
  height: "72vw",
  background: "radial-gradient(circle at 50% 50%, rgba(84, 146, 255, 0.2), rgba(84, 146, 255, 0) 72%)",
};

const S_GRID: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  opacity: 0.22,
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
  `,
  backgroundSize: "40px 40px, 40px 40px",
  maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.06))",
  WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.06))",
};

const S_CONTENT_BASE: CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  boxSizing: "border-box",
  padding: "max(24px, env(safe-area-inset-top, 0px) + 16px) 20px max(24px, env(safe-area-inset-bottom, 0px) + 16px)",
};

const S_CONTENT_CENTER: CSSProperties = {
  ...S_CONTENT_BASE,
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const S_CONTENT_TOP: CSSProperties = {
  ...S_CONTENT_BASE,
  display: "flex",
  justifyContent: "center",
};

const S_INNER: CSSProperties = {
  width: "100%",
  maxWidth: 980,
};

// Pre-computed inner style variants — avoids inline spread on every render
const _innerStyleCache = new Map<number | undefined, CSSProperties>();
function getInnerStyle(maxWidth?: number): CSSProperties {
  if (!maxWidth) return S_INNER;
  let s = _innerStyleCache.get(maxWidth);
  if (!s) {
    s = { ...S_INNER, maxWidth };
    _innerStyleCache.set(maxWidth, s);
  }
  return s;
}

export function BrandPageShell({ children, centered = false, maxWidth }: BrandPageShellProps) {
  return (
    <div style={S_ROOT}>
      <div style={S_AURORA_TOP_LEFT} />
      <div style={S_AURORA_TOP_RIGHT} />
      <div style={S_AURORA_BOTTOM} />
      <div style={S_GRID} />
      <main style={centered ? S_CONTENT_CENTER : S_CONTENT_TOP}>
        <div style={getInnerStyle(maxWidth)}>{children}</div>
      </main>
    </div>
  );
}
