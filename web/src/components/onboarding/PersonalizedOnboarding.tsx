/**
 * PersonalizedOnboarding - 个性化引导流程
 *
 * 4 步交互式引导：Welcome → About You → Your Goals → Ready
 * 收集用户兴趣和目标 skills → 种子星座 + 灵人格定制
 */

import { useState, useCallback, useEffect, useRef, useMemo, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  LuPalette, LuCode, LuBookOpen, LuBriefcase,
  LuGamepad2, LuGlobe, LuCheck,
} from "react-icons/lu";
import { getSkillsByTags, getMetaByKey, getSkillLabel, type SkillMeta } from "../../config/skill-registry";
import { useConstellation } from "../../hooks/useConstellation";
import { SK_ONBOARDING_DONE, SK_USER_PREFERENCES } from "@/constants/storage-keys";

const STORAGE_KEY = SK_ONBOARDING_DONE;
const PREFS_KEY = SK_USER_PREFERENCES;

interface PersonalizedOnboardingProps {
  onComplete: () => void;
}

// Interest cards definition
const INTERESTS = [
  { tag: "creative", icon: LuPalette, color: "#f472b6" },
  { tag: "tech",     icon: LuCode,    color: "#10b981" },
  { tag: "learning", icon: LuBookOpen, color: "#60a5fa" },
  { tag: "work",     icon: LuBriefcase, color: "#fb923c" },
  { tag: "fun",      icon: LuGamepad2, color: "#a78bfa" },
  { tag: "life",     icon: LuGlobe,   color: "#facc15" },
] as const;

const MAX_GOALS = 3;

// Slide animation variants
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 200 : -200,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -200 : 200,
    opacity: 0,
  }),
};

// ─── Static style constants (avoid per-render allocation) ───

const S_OVERLAY_BASE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10001,
  background: "var(--ling-overlay-heavy)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--ling-space-5)",
  transition: `opacity var(--ling-duration-slow)`,
};
const S_OVERLAY_VISIBLE: CSSProperties = { ...S_OVERLAY_BASE, opacity: 1 };
const S_OVERLAY_EXITING: CSSProperties = { ...S_OVERLAY_BASE, opacity: 0 };

const S_DOTS_ROW: CSSProperties = { display: "flex", gap: "var(--ling-space-2)", marginBottom: "var(--ling-space-8)" };

const S_DOT_BASE: CSSProperties = {
  height: "var(--ling-space-2)",
  borderRadius: "var(--ling-space-1)",
  transition: `width var(--ling-duration-normal), background-color var(--ling-duration-normal)`,
};
const S_DOT_ACTIVE: CSSProperties = { ...S_DOT_BASE, width: "var(--ling-space-6)", background: "var(--ling-purple)" };
const S_DOT_DONE: CSSProperties = { ...S_DOT_BASE, width: "var(--ling-space-2)", background: "var(--ling-purple-deep)" };
const S_DOT_PENDING: CSSProperties = { ...S_DOT_BASE, width: "var(--ling-space-2)", background: "var(--ling-overlay-12)" };

const S_STEP_CONTENT: CSSProperties = { maxWidth: "480px", width: "100%", textAlign: "center" };

const S_NAV_ROW: CSSProperties = { display: "flex", gap: "var(--ling-space-3)", marginTop: "var(--ling-space-8)" };

const S_BTN_SKIP: CSSProperties = {
  padding: "var(--ling-space-3) var(--ling-space-6)", borderRadius: "var(--ling-radius-md)",
  border: "1px solid var(--ling-overlay-8)", background: "transparent",
  color: "var(--ling-text-dim)", fontSize: "var(--ling-font-md)",
  cursor: "pointer", transition: `color var(--ling-duration-fast), border-color var(--ling-duration-fast)`,
};
const S_BTN_BACK: CSSProperties = {
  padding: "var(--ling-space-3) var(--ling-space-6)", borderRadius: "var(--ling-radius-md)",
  border: "1px solid var(--ling-overlay-12)", background: "var(--ling-overlay-4)",
  color: "var(--ling-text-soft)", fontSize: "var(--ling-font-md)",
  cursor: "pointer", transition: `color var(--ling-duration-fast), background-color var(--ling-duration-fast), border-color var(--ling-duration-fast)`,
};
const S_BTN_NEXT: CSSProperties = {
  padding: "var(--ling-space-3) var(--ling-space-8)", borderRadius: "var(--ling-radius-md)",
  border: "none", background: "var(--ling-purple)", color: "#fff",
  fontSize: "var(--ling-font-md)", fontWeight: 600,
  cursor: "pointer", transition: `background-color var(--ling-duration-fast), transform var(--ling-duration-fast)`,
};

// ── Step: Welcome ──
const S_STAR_WRAP: CSSProperties = { marginBottom: "var(--ling-space-6)" };
const S_STAR_SVG: CSSProperties = { filter: "drop-shadow(0 0 20px var(--ling-purple-50))" };
const S_TITLE_LG: CSSProperties = {
  color: "#fff", fontSize: "var(--ling-font-3xl)", fontWeight: 700,
  margin: "0 0 var(--ling-space-3)", lineHeight: 1.3,
};
const S_DESC_WELCOME: CSSProperties = {
  color: "var(--ling-text-dim)", fontSize: "var(--ling-font-15)",
  lineHeight: 1.7, margin: "0 0 var(--ling-space-8)", maxWidth: "360px",
  marginLeft: "auto", marginRight: "auto",
};
const S_BTN_START: CSSProperties = {
  padding: "var(--ling-space-4) 36px", borderRadius: "var(--ling-radius-md)",
  border: "none", background: "var(--ling-purple)", color: "#fff",
  fontSize: "var(--ling-font-15)", fontWeight: 600,
  cursor: "pointer", transition: `background-color var(--ling-duration-fast), transform var(--ling-duration-fast)`,
};

// ── Step: Interests ──
const S_TITLE_MD: CSSProperties = {
  color: "#fff", fontSize: "var(--ling-font-2xl)", fontWeight: 700, margin: "0 0 var(--ling-space-2)",
};
const S_SUB_INTERESTS: CSSProperties = {
  color: "var(--ling-text-dim)", fontSize: "var(--ling-font-md)", margin: "0 0 var(--ling-space-7)",
};
const S_GRID_INTERESTS: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
  gap: "var(--ling-space-3)", maxWidth: "min(400px, 100%)", margin: "0 auto",
};
const S_CARD_BASE: CSSProperties = {
  position: "relative", padding: "var(--ling-space-5) var(--ling-space-3)", borderRadius: "var(--ling-radius-lg)",
  display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--ling-space-2)",
  cursor: "pointer", transition: `border-color var(--ling-duration-fast), background-color var(--ling-duration-fast)`,
  font: "inherit", color: "inherit",
};
const S_CHECK_BADGE: CSSProperties = {
  position: "absolute", top: "var(--ling-radius-sm)", right: "var(--ling-radius-sm)", width: 18, height: 18,
  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
};
const S_CHECK_ML: CSSProperties = { marginLeft: "var(--ling-space-1)" };

// ── Step: Goals ──
const S_SUB_GOALS: CSSProperties = {
  color: "var(--ling-text-dim)", fontSize: "var(--ling-font-md)", margin: "0 0 var(--ling-space-6)",
};
const S_GRID_GOALS: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "var(--ling-space-3)",
  justifyContent: "center", maxWidth: "min(440px, 100%)", margin: "0 auto",
};
const S_MEMORY_INNER: CSSProperties = { textAlign: "left", flex: 1 };
const S_MEMORY_NOTE: CSSProperties = { fontSize: "var(--ling-font-xs)", color: "var(--ling-text-dim)", marginTop: "2px" };
const S_GOAL_CARD_BASE: CSSProperties = {
  position: "relative", padding: "var(--ling-space-3) var(--ling-space-5)", borderRadius: "var(--ling-radius-md)",
  display: "flex", alignItems: "center", gap: "var(--ling-space-2)",
  transition: `border-color var(--ling-duration-fast), background-color var(--ling-duration-fast), opacity var(--ling-duration-fast)`,
  font: "inherit", color: "inherit",
};
const S_MAX_GOALS: CSSProperties = {
  fontSize: "var(--ling-font-sm)", color: "var(--ling-text-muted)", marginTop: "var(--ling-space-3)",
};

// ─── Lazy-cached dynamic styles (avoids per-render allocation in .map()) ───
// Pattern matches SuggestionChips._chipCache and ToolResultCard._dotCache.

const _interestCardCache = new Map<string, CSSProperties>();
function getInterestCardStyle(color: string, isSelected: boolean): CSSProperties {
  const key = `${color}:${isSelected}`;
  let s = _interestCardCache.get(key);
  if (!s) {
    s = {
      ...S_CARD_BASE,
      border: `1.5px solid ${isSelected ? `${color}80` : "rgba(255,255,255,0.1)"}`,
      background: isSelected ? `${color}20` : "rgba(255,255,255,0.06)",
    };
    _interestCardCache.set(key, s);
  }
  return s;
}

const _labelCache = new Map<string, CSSProperties>();
function getLabelStyle(color: string, isSelected: boolean): CSSProperties {
  const key = `${color}:${isSelected}`;
  let s = _labelCache.get(key);
  if (!s) {
    s = {
      fontSize: "var(--ling-font-13)",
      color: isSelected ? color : "rgba(255,255,255,0.6)",
      fontWeight: isSelected ? 600 : 400,
    };
    _labelCache.set(key, s);
  }
  return s;
}

const _checkBadgeCache = new Map<string, CSSProperties>();
function getCheckBadgeStyle(color: string): CSSProperties {
  let s = _checkBadgeCache.get(color);
  if (!s) {
    s = { ...S_CHECK_BADGE, background: color };
    _checkBadgeCache.set(color, s);
  }
  return s;
}

const _goalCardCache = new Map<string, CSSProperties>();
function getGoalCardStyle(color: string, isSelected: boolean, isFull: boolean): CSSProperties {
  const key = `${color}:${isSelected}:${isFull}`;
  let s = _goalCardCache.get(key);
  if (!s) {
    s = {
      ...S_GOAL_CARD_BASE,
      border: `1.5px solid ${isSelected ? `${color}80` : "rgba(255,255,255,0.1)"}`,
      background: isSelected ? `${color}20` : "rgba(255,255,255,0.06)",
      cursor: isFull ? "not-allowed" : "pointer",
      opacity: isFull ? 0.4 : 1,
    };
    _goalCardCache.set(key, s);
  }
  return s;
}

const _memoryCardCache = new Map<string, CSSProperties>();
function getMemoryCardStyle(color: string): CSSProperties {
  let s = _memoryCardCache.get(color);
  if (!s) {
    s = {
      padding: "var(--ling-space-3) var(--ling-space-4)", borderRadius: "var(--ling-radius-md)",
      border: `1.5px solid ${color}80`, background: `${color}20`,
      display: "flex", alignItems: "center", gap: "var(--ling-space-2)", width: "100%",
    };
    _memoryCardCache.set(color, s);
  }
  return s;
}

const _memoryLabelCache = new Map<string, CSSProperties>();
function getMemoryLabelStyle(color: string): CSSProperties {
  let s = _memoryLabelCache.get(color);
  if (!s) {
    s = { fontSize: "var(--ling-font-md)", color, fontWeight: 600 };
    _memoryLabelCache.set(color, s);
  }
  return s;
}

// ── Step: Ready ──
const S_DESC_READY: CSSProperties = {
  color: "var(--ling-text-dim)", fontSize: "var(--ling-font-15)", margin: "0 0 var(--ling-space-7)",
};
const S_CONSTELLATION: CSSProperties = {
  position: "relative", width: "200px", height: "200px", margin: "0 auto var(--ling-space-6)",
};
const S_CONSTELLATION_SVG: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const S_HINT_ITALIC: CSSProperties = {
  fontSize: "var(--ling-font-13)", color: "var(--ling-text-muted)", fontStyle: "italic",
};

export function PersonalizedOnboarding({ onComplete }: PersonalizedOnboardingProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("zh") ? "zh" : "en";
  const { seedSkills } = useConstellation();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  // Timer ref for the 400ms exit animation delay — cleared on unmount
  // to prevent onComplete firing after the component is torn down.
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(exitTimerRef.current); }, []);

  // Memory is always included
  const alwaysIncluded = "memory";

  // Dynamic goal skills based on selected interests
  const goalSkills = useMemo(() => {
    if (selectedInterests.length === 0) {
      // If nothing selected, show a default set
      return getSkillsByTags(["creative", "tech", "learning", "life"]);
    }
    return getSkillsByTags(selectedInterests);
  }, [selectedInterests]);

  const finish = useCallback(() => {
    setExiting(true);
    sessionStorage.setItem(STORAGE_KEY, "true");

    // Save user preferences
    const allGoals = [...new Set([alwaysIncluded, ...selectedGoals])];
    const prefs = {
      interests: selectedInterests,
      goalSkills: allGoals,
      completedAt: Date.now(),
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

    // Seed constellation
    seedSkills(allGoals);

    exitTimerRef.current = setTimeout(onComplete, 400);
  }, [onComplete, selectedInterests, selectedGoals, seedSkills]);

  const skip = useCallback(() => {
    setExiting(true);
    sessionStorage.setItem(STORAGE_KEY, "true");
    exitTimerRef.current = setTimeout(onComplete, 400);
  }, [onComplete]);

  const goNext = useCallback(() => {
    if (step < 3) {
      setDirection(1);
      setStep(s => s + 1);
    } else {
      finish();
    }
  }, [step, finish]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  }, [step]);

  // Keep a ref so the ESC listener always calls the latest skip
  const skipRef = useRef(skip);
  skipRef.current = skip;

  // ESC to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleInterest = useCallback((tag: string) => {
    setSelectedInterests(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  const toggleGoal = useCallback((key: string) => {
    setSelectedGoals(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= MAX_GOALS) return prev;
      return [...prev, key];
    });
  }, []);

  const TOTAL_STEPS = 4;

  return (
    <div style={exiting ? S_OVERLAY_EXITING : S_OVERLAY_VISIBLE} role="dialog" aria-modal="true" aria-label={t("onboarding.welcome")}>
      {/* Progress dots */}
      <div style={S_DOTS_ROW} role="group" aria-label={t("onboarding.stepProgress", { current: String(step + 1), total: String(TOTAL_STEPS) })}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            style={i === step ? S_DOT_ACTIVE : i < step ? S_DOT_DONE : S_DOT_PENDING}
            role="presentation"
            aria-current={i === step ? "step" : undefined}
          />
        ))}
      </div>

      {/* Step content with slide animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={S_STEP_CONTENT}
        >
          {step === 0 && (
            <StepWelcome t={t} onNext={goNext} />
          )}
          {step === 1 && (
            <StepInterests
              t={t}
              selected={selectedInterests}
              onToggle={toggleInterest}
            />
          )}
          {step === 2 && (
            <StepGoals
              t={t}
              lang={lang}
              skills={goalSkills}
              selected={selectedGoals}
              onToggle={toggleGoal}
            />
          )}
          {step === 3 && (
            <StepReady
              t={t}
              goals={[...new Set([alwaysIncluded, ...selectedGoals])]}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
      <div style={S_NAV_ROW}>
        <button className="ling-ob-skip" onClick={skip} style={S_BTN_SKIP}>
          {t("onboarding.skip")}
        </button>
        {step > 0 && step < 3 && (
          <button className="ling-ob-back" onClick={goBack} style={S_BTN_BACK} aria-label={t("onboarding.back")}>
            {"←"}
          </button>
        )}
        {step > 0 && (
          <button
            className="ling-ob-next"
            onClick={step === 3 ? finish : goNext}
            style={S_BTN_NEXT}
          >
            {step === 3 ? t("onboarding.begin") : t("onboarding.next")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step 0: Welcome ─────────────────────────────────────────────
function StepWelcome({ t, onNext }: { t: (k: string) => string; onNext: () => void }) {
  return (
    <>
      {/* Star icon SVG */}
      <div style={S_STAR_WRAP} aria-hidden="true">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(196,181,253,0.8)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={S_STAR_SVG}
          aria-hidden="true"
        >
          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" />
        </svg>
      </div>
      <h2 style={S_TITLE_LG}>
        {t("onboarding.welcome")}
      </h2>
      <p style={S_DESC_WELCOME}>
        {t("onboarding.welcomeSub")}
      </p>
      <button className="ling-ob-next" onClick={onNext} style={S_BTN_START}>
        {t("onboarding.start")}
      </button>
    </>
  );
}

// ── Step 1: Interests ───────────────────────────────────────────
function StepInterests({
  t, selected, onToggle,
}: {
  t: (k: string, opts?: Record<string, string>) => string;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <>
      <h2 style={S_TITLE_MD}>
        {t("onboarding.aboutYou")}
      </h2>
      <p style={S_SUB_INTERESTS}>
        {t("onboarding.aboutYouSub")}
      </p>
      <div style={S_GRID_INTERESTS}>
        {INTERESTS.map(({ tag, icon: Icon, color }) => {
          const isSelected = selected.includes(tag);
          return (
            <button
              key={tag}
              className="ling-ob-card"
              onClick={() => onToggle(tag)}
              aria-pressed={isSelected}
              style={getInterestCardStyle(color, isSelected)}
            >
              <Icon size={24} color={isSelected ? color : "rgba(255,255,255,0.5)"} aria-hidden="true" />
              <span style={getLabelStyle(color, isSelected)}>
                {t(`onboarding.interests.${tag}`)}
              </span>
              {isSelected && (
                <div style={getCheckBadgeStyle(color)}>
                  <LuCheck size={12} color="#fff" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Step 2: Goals ───────────────────────────────────────────────
function StepGoals({
  t, lang, skills, selected, onToggle,
}: {
  t: (k: string, opts?: Record<string, string>) => string;
  lang: string;
  skills: SkillMeta[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  // Memory is always included — show it first with special styling
  const memoryMeta = getMetaByKey("memory");
  const otherSkills = skills.filter(s => s.key !== "memory");

  return (
    <>
      <h2 style={S_TITLE_MD}>
        {t("onboarding.goals")}
      </h2>
      <p style={S_SUB_GOALS}>
        {t("onboarding.goalsSub")}
      </p>

      <div style={S_GRID_GOALS}>
        {/* Memory — always included, not toggleable */}
        <div style={getMemoryCardStyle(memoryMeta.color)}>
          <memoryMeta.icon size={20} color={memoryMeta.color} />
          <div style={S_MEMORY_INNER}>
            <span style={getMemoryLabelStyle(memoryMeta.color)}>
              {getSkillLabel(memoryMeta, lang)}
            </span>
            <div style={S_MEMORY_NOTE}>
              {t("onboarding.memoryNote")}
            </div>
          </div>
          <LuCheck size={16} color={memoryMeta.color} />
        </div>

        {/* Other skills */}
        {otherSkills.map(meta => {
          const isSelected = selected.includes(meta.key);
          const isFull = selected.length >= MAX_GOALS && !isSelected;
          const Icon = meta.icon;
          return (
            <button
              key={meta.key}
              className="ling-ob-card"
              onClick={() => !isFull && onToggle(meta.key)}
              disabled={isFull}
              aria-pressed={isSelected}
              style={getGoalCardStyle(meta.color, isSelected, isFull)}
            >
              <Icon size={18} color={isSelected ? meta.color : "rgba(255,255,255,0.5)"} aria-hidden="true" />
              <span style={getLabelStyle(meta.color, isSelected)}>
                {getSkillLabel(meta, lang)}
              </span>
              {isSelected && (
                <LuCheck size={14} color={meta.color} style={S_CHECK_ML} />
              )}
            </button>
          );
        })}
      </div>

      {selected.length >= MAX_GOALS && (
        <p style={S_MAX_GOALS}>
          {t("onboarding.maxGoals", { max: String(MAX_GOALS) })}
        </p>
      )}
    </>
  );
}

// ── Step 3: Ready ───────────────────────────────────────────────
function StepReady({
  t, goals,
}: {
  t: (k: string, opts?: Record<string, string>) => string;
  goals: string[];
}) {
  // Pre-compute constellation geometry once per goal set.
  // Eliminates duplicate trig calculations and stabilises style objects.
  const layout = useMemo(() =>
    goals.map((key, i) => {
      const meta = getMetaByKey(key);
      const total = goals.length;
      const angle = (-180 + i * (150 / Math.max(total - 1, 1))) * (Math.PI / 180);
      const r = 70;
      const cx = 100 + r * Math.cos(angle);
      const cy = 100 + r * Math.sin(angle);
      return {
        key,
        meta,
        cx,
        cy,
        nodeStyle: {
          position: "absolute" as const,
          left: cx - 18,
          top: cy - 18,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${meta.color}30, rgba(10,0,21,0.6))`,
          border: `1.5px solid ${meta.color}66`,
          display: "flex" as const,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          boxShadow: `0 0 12px ${meta.color}33`,
        } as CSSProperties,
      };
    }),
    [goals],
  );

  return (
    <>
      <h2 style={S_TITLE_LG}>
        {t("onboarding.ready")}
      </h2>
      <p style={S_DESC_READY}>
        {t("onboarding.readySub")}
      </p>

      {/* Mini constellation preview */}
      <div style={S_CONSTELLATION}>
        {layout.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 300 }}
            style={item.nodeStyle}
          >
            <item.meta.icon size={16} color={item.meta.color} />
          </motion.div>
        ))}

        {/* Connection lines — reuse pre-computed cx/cy */}
        <svg style={S_CONSTELLATION_SVG}>
          {layout.map((item, i) => {
            if (i === layout.length - 1) return null;
            const next = layout[i + 1];
            return (
              <motion.line
                key={i}
                x1={item.cx} y1={item.cy}
                x2={next.cx} y2={next.cy}
                stroke="var(--ling-purple-15)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
              />
            );
          })}
        </svg>
      </div>

      <p style={S_HINT_ITALIC}>
        {t("onboarding.readyHint")}
      </p>
    </>
  );
}

