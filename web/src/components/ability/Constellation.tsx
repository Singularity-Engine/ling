import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useConstellation } from "../../hooks/useConstellation";
import { useToolState } from "../../context/ToolStateContext";
import { getSkillMeta, getMetaByKey, getSkillLabel, type SkillMeta } from "../../config/skill-registry";
// Keyframes moved to static index.css — no runtime injection needed.

// ── Arc layout helpers ──────────────────────────────────────────
const ARC_SPAN = 150;
const START_ANGLE = -180;
const INNER_RADIUS = 80;
const OUTER_RADIUS = 110;

function getPosition(i: number, total: number, radius: number) {
  const step = total > 1 ? ARC_SPAN / (total - 1) : 0;
  const angle = (START_ANGLE + i * step) * (Math.PI / 180);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

// ── Pre-allocated style constants ────────────────────────────────
const S_CONTAINER: CSSProperties = { position: "relative" };
const S_BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--ling-overlay-dim)",
  zIndex: 24,
};
const S_STARFIELD: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "22px",
  width: 0,
  height: 0,
  zIndex: 26,
};
const S_SVG: CSSProperties = {
  position: "absolute",
  left: -OUTER_RADIUS - 20,
  top: -OUTER_RADIUS - 20,
  width: (OUTER_RADIUS + 20) * 2,
  height: (OUTER_RADIUS + 20) * 2,
  pointerEvents: "none",
  overflow: "visible",
};
const CLOSED_VARIANT = { x: 0, y: 0, opacity: 0, scale: 0.3 };
const STAGGER_VARIANTS = {
  open: { transition: { staggerChildren: 0.05 } },
  closed: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
};
const LINE_VARIANTS = {
  closed: { pathLength: 0, opacity: 0 },
  open: { pathLength: 1, opacity: 1 },
};
const WHILETAP_095 = { scale: 0.95 };
const WHILETAP_090 = { scale: 0.9 };
const CORE_OPEN = { rotate: 45 };
const CORE_CLOSED = { rotate: 0 };
const CORE_TRANSITION = { type: "spring" as const, stiffness: 300, damping: 20 };
const FADE_IN = { opacity: 0 };
const FADE_VISIBLE = { opacity: 1 };
const FADE_TRANSITION = { duration: 0.2 };

// ── Star button (memo'd — rendered in a list) ───────────────────
const StarButton = memo(function StarButton({
  meta,
  count,
  maxCount,
  position,
  isBirthing,
  skillKey,
  onStarClick,
  delay,
}: {
  meta: SkillMeta;
  count: number;
  maxCount: number;
  position: { x: number; y: number };
  isBirthing: boolean;
  skillKey: string;
  onStarClick: (key: string) => void;
  delay: number;
}) {
  const { i18n } = useTranslation();
  const baseSize = 40;
  const maxBonus = 8;
  const size = baseSize + (maxCount > 0 ? (count / maxCount) * maxBonus : 0);
  const Icon = meta.icon;
  const handleClick = useCallback(() => onStarClick(skillKey), [onStarClick, skillKey]);

  const whileHover = useMemo(() => ({ scale: 1.15, boxShadow: `0 0 20px ${meta.color}66` }), [meta.color]);

  const starStyle = useMemo<CSSProperties>(() => ({
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    background: `radial-gradient(circle at 30% 30%, ${meta.color}30, rgba(10,0,21,0.6))`,
    border: `1.5px solid ${meta.color}88`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    font: "inherit",
    color: "inherit",
    animation: isBirthing ? "constellationBirth 0.6s ease-out" : undefined,
    boxShadow: `0 0 8px ${meta.color}33`,
  }), [size, meta.color, isBirthing]);

  const variants = useMemo(
    () => ({ closed: CLOSED_VARIANT, open: { x: position.x, y: position.y, opacity: 1, scale: 1 } }),
    [position.x, position.y],
  );
  const transition = useMemo(
    () => ({ type: "spring" as const, stiffness: 320, damping: 22, delay }),
    [delay],
  );

  return (
    <motion.button
      role="menuitem"
      variants={variants}
      transition={transition}
      onClick={handleClick}
      aria-label={getSkillLabel(meta, i18n.language)}
      style={starStyle}
      whileHover={whileHover}
      whileTap={WHILETAP_095}
    >
      <Icon size={18} color={meta.color} />
    </motion.button>
  );
});

// ── Main Constellation component ────────────────────────────────
export const Constellation = memo(() => {
  const { t } = useTranslation();
  const { discovered, isNew, newSkillKey, clearNewFlag } = useConstellation();
  const { activeToolName } = useToolState();
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Active tool color for core glow
  const activeMeta = activeToolName ? getSkillMeta(activeToolName) : null;
  const coreColor = activeMeta ? activeMeta.color : "var(--ling-purple-60)";
  const coreBorderColor = activeMeta ? `${activeMeta.color}cc` : "var(--ling-purple-40)";

  // Sort discovered by count descending for display
  const sorted = useMemo(
    () => [...discovered].sort((a, b) => b.count - a.count),
    [discovered]
  );
  const maxCount = useMemo(
    () => Math.max(...sorted.map(s => s.count), 1),
    [sorted]
  );

  // Compute positions: <=8 single ring, >8 two rings
  const positions = useMemo(() => {
    if (sorted.length <= 8) {
      return sorted.map((_, i) => getPosition(i, sorted.length, INNER_RADIUS));
    }
    const innerCount = Math.min(7, sorted.length);
    const outerCount = sorted.length - innerCount;
    return sorted.map((_, i) => {
      if (i < innerCount) return getPosition(i, innerCount, INNER_RADIUS - 5);
      return getPosition(i - innerCount, outerCount, OUTER_RADIUS);
    });
  }, [sorted]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Handle star click → fill input + close
  const handleStarClick = useCallback(
    (key: string) => {
      const promptKey = `constellation.prompt.${key}`;
      const prompt = t(promptKey);
      if (prompt && prompt !== promptKey) {
        window.dispatchEvent(
          new CustomEvent("fill-input", { detail: { text: prompt } })
        );
      }
      setIsOpen(false);
    },
    [t]
  );

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
    if (isNew) clearNewFlag();
  }, [isNew, clearNewFlag]);

  const closeConstellation = useCallback(() => setIsOpen(false), []);
  const setHoveredTrue = useCallback(() => setHovered(true), []);
  const setHoveredFalse = useCallback(() => setHovered(false), []);

  const coreStyle = useMemo<CSSProperties>(() => ({
    position: "relative",
    zIndex: 27,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: isOpen ? "var(--ling-purple-30)" : "var(--ling-purple-15)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1.5px solid ${coreBorderColor}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    font: "inherit",
    color: "inherit",
    boxShadow: hovered ? `0 0 20px ${coreColor}55` : undefined,
    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
  }), [isOpen, coreBorderColor, hovered, coreColor]);

  // Tooltip text
  const tooltipText = discovered.length === 0
    ? t("constellation.emptyHint")
    : isOpen ? t("constellation.close") : t("constellation.open");

  return (
    <div ref={containerRef} style={S_CONTAINER}>
      {/* ── Backdrop (when open) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={FADE_IN}
            animate={FADE_VISIBLE}
            exit={FADE_IN}
            transition={FADE_TRANSITION}
            onClick={closeConstellation}
            aria-hidden="true"
            style={S_BACKDROP}
          />
        )}
      </AnimatePresence>

      {/* ── Star field (when open) ── */}
      <AnimatePresence>
        {isOpen && sorted.length > 0 && (
          <motion.div
            role="menu"
            aria-label={t("constellation.open")}
            initial="closed"
            animate="open"
            exit="closed"
            variants={STAGGER_VARIANTS}
            style={S_STARFIELD}
          >
            {/* Connection lines */}
            <svg style={S_SVG}>
              {sorted.length > 1 &&
                sorted.map((_, i) => {
                  if (i === sorted.length - 1) return null;
                  const p1 = positions[i];
                  const p2 = positions[i + 1];
                  return (
                    <motion.line
                      key={`${sorted[i].key}-${sorted[i + 1].key}`}
                      x1={p1.x + OUTER_RADIUS + 20}
                      y1={p1.y + OUTER_RADIUS + 20}
                      x2={p2.x + OUTER_RADIUS + 20}
                      y2={p2.y + OUTER_RADIUS + 20}
                      stroke="var(--ling-purple-12)"
                      strokeWidth="1"
                      variants={LINE_VARIANTS}
                      transition={{ duration: 0.4, delay: i * 0.05 }}
                    />
                  );
                })}
            </svg>

            {sorted.map((skill, i) => {
              const meta = getMetaByKey(skill.key);
              return (
                <StarButton
                  key={skill.key}
                  meta={meta}
                  count={skill.count}
                  maxCount={maxCount}
                  position={positions[i]}
                  isBirthing={newSkillKey === skill.key}
                  skillKey={skill.key}
                  onStarClick={handleStarClick}
                  delay={i * 0.05}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Core button (always visible) ── */}
      <motion.button
        className={`constellation-core${isNew ? " constellation-flash" : ""}`}
        onClick={toggleOpen}
        onMouseEnter={setHoveredTrue}
        onMouseLeave={setHoveredFalse}
        aria-label={tooltipText}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={tooltipText}
        animate={isOpen ? CORE_OPEN : CORE_CLOSED}
        whileTap={WHILETAP_090}
        transition={CORE_TRANSITION}
        style={coreStyle}
      >
        {/* Star icon SVG */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={activeMeta ? activeMeta.color : "var(--ling-purple-lighter)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" />
        </svg>
      </motion.button>
    </div>
  );
});

Constellation.displayName = "Constellation";
