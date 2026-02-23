/**
 * PersonalizedOnboarding - 个性化引导流程
 *
 * 4 步交互式引导：Welcome → About You → Your Goals → Ready
 * 收集用户兴趣和目标 skills → 种子星座 + 灵人格定制
 */

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  LuPalette, LuCode, LuBookOpen, LuBriefcase,
  LuGamepad2, LuGlobe, LuCheck,
} from "react-icons/lu";
import { getSkillsByTags, getMetaByKey, getSkillLabel, type SkillMeta } from "../../config/skill-registry";
import { useConstellation } from "../../hooks/use-constellation";
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
  background: "rgba(0, 0, 0, 0.85)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  transition: "opacity 0.4s ease",
};
const S_OVERLAY_VISIBLE: CSSProperties = { ...S_OVERLAY_BASE, opacity: 1 };
const S_OVERLAY_EXITING: CSSProperties = { ...S_OVERLAY_BASE, opacity: 0 };

const S_DOTS_ROW: CSSProperties = { display: "flex", gap: "8px", marginBottom: "32px" };

const S_DOT_BASE: CSSProperties = {
  height: "8px",
  borderRadius: "4px",
  transition: "width 0.3s ease, background-color 0.3s ease",
};
const S_DOT_ACTIVE: CSSProperties = { ...S_DOT_BASE, width: "24px", background: "#8b5cf6" };
const S_DOT_DONE: CSSProperties = { ...S_DOT_BASE, width: "8px", background: "#6d28d9" };
const S_DOT_PENDING: CSSProperties = { ...S_DOT_BASE, width: "8px", background: "rgba(255,255,255,0.15)" };

const S_STEP_CONTENT: CSSProperties = { maxWidth: "480px", width: "100%", textAlign: "center" };

const S_NAV_ROW: CSSProperties = { display: "flex", gap: "12px", marginTop: "32px" };

const S_BTN_SKIP: CSSProperties = {
  padding: "12px 24px", borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
  color: "rgba(255,255,255,0.4)", fontSize: "14px",
  cursor: "pointer", transition: "color 0.2s, border-color 0.2s",
};
const S_BTN_BACK: CSSProperties = {
  padding: "12px 24px", borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.6)", fontSize: "14px",
  cursor: "pointer", transition: "color 0.2s, background-color 0.2s, border-color 0.2s",
};
const S_BTN_NEXT: CSSProperties = {
  padding: "12px 32px", borderRadius: "12px",
  border: "none", background: "#8b5cf6", color: "#fff",
  fontSize: "14px", fontWeight: 600,
  cursor: "pointer", transition: "background-color 0.2s, transform 0.2s",
};

// ── Step: Welcome ──
const S_STAR_WRAP: CSSProperties = { marginBottom: "24px" };
const S_STAR_SVG: CSSProperties = { filter: "drop-shadow(0 0 20px rgba(139,92,246,0.5))" };
const S_TITLE_LG: CSSProperties = {
  color: "#fff", fontSize: "28px", fontWeight: 700,
  margin: "0 0 12px", lineHeight: 1.3,
};
const S_DESC_WELCOME: CSSProperties = {
  color: "rgba(255,255,255,0.5)", fontSize: "15px",
  lineHeight: 1.7, margin: "0 0 32px", maxWidth: "360px",
  marginLeft: "auto", marginRight: "auto",
};
const S_BTN_START: CSSProperties = {
  padding: "14px 36px", borderRadius: "12px",
  border: "none", background: "#8b5cf6", color: "#fff",
  fontSize: "15px", fontWeight: 600,
  cursor: "pointer", transition: "background-color 0.2s, transform 0.2s",
};

// ── Step: Interests ──
const S_TITLE_MD: CSSProperties = {
  color: "#fff", fontSize: "24px", fontWeight: 700, margin: "0 0 8px",
};
const S_SUB_INTERESTS: CSSProperties = {
  color: "rgba(255,255,255,0.4)", fontSize: "14px", margin: "0 0 28px",
};
const S_GRID_INTERESTS: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
  gap: "12px", maxWidth: "min(400px, 100%)", margin: "0 auto",
};
const S_CARD_BASE: CSSProperties = {
  position: "relative", padding: "20px 12px", borderRadius: "16px",
  display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
  cursor: "pointer", transition: "border-color 0.2s ease, background-color 0.2s ease",
  font: "inherit", color: "inherit",
};
const S_CHECK_BADGE: CSSProperties = {
  position: "absolute", top: 6, right: 6, width: 18, height: 18,
  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
};
const S_CHECK_ML: CSSProperties = { marginLeft: 4 };

// ── Step: Goals ──
const S_SUB_GOALS: CSSProperties = {
  color: "rgba(255,255,255,0.4)", fontSize: "14px", margin: "0 0 24px",
};
const S_GRID_GOALS: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "10px",
  justifyContent: "center", maxWidth: "min(440px, 100%)", margin: "0 auto",
};
const S_MEMORY_INNER: CSSProperties = { textAlign: "left", flex: 1 };
const S_MEMORY_NOTE: CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 2 };
const S_GOAL_CARD_BASE: CSSProperties = {
  position: "relative", padding: "12px 18px", borderRadius: "14px",
  display: "flex", alignItems: "center", gap: "8px",
  transition: "border-color 0.2s ease, background-color 0.2s ease, opacity 0.2s ease",
  font: "inherit", color: "inherit",
};
const S_MAX_GOALS: CSSProperties = {
  fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "12px",
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
      fontSize: "13px",
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
      padding: "12px 16px", borderRadius: "14px",
      border: `1.5px solid ${color}80`, background: `${color}20`,
      display: "flex", alignItems: "center", gap: "8px", width: "100%",
    };
    _memoryCardCache.set(color, s);
  }
  return s;
}

const _memoryLabelCache = new Map<string, CSSProperties>();
function getMemoryLabelStyle(color: string): CSSProperties {
  let s = _memoryLabelCache.get(color);
  if (!s) {
    s = { fontSize: "14px", color, fontWeight: 600 };
    _memoryLabelCache.set(color, s);
  }
  return s;
}

// ── Step: Ready ──
const S_DESC_READY: CSSProperties = {
  color: "rgba(255,255,255,0.5)", fontSize: "15px", margin: "0 0 28px",
};
const S_CONSTELLATION: CSSProperties = {
  position: "relative", width: "200px", height: "200px", margin: "0 auto 24px",
};
const S_CONSTELLATION_SVG: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const S_HINT_ITALIC: CSSProperties = {
  fontSize: "13px", color: "rgba(255,255,255,0.3)", fontStyle: "italic",
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

    setTimeout(onComplete, 400);
  }, [onComplete, selectedInterests, selectedGoals, seedSkills]);

  const skip = useCallback(() => {
    setExiting(true);
    sessionStorage.setItem(STORAGE_KEY, "true");
    setTimeout(onComplete, 400);
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

  // ESC to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [skip]);

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
        <button onClick={skip} style={S_BTN_SKIP}>
          {t("onboarding.skip")}
        </button>
        {step > 0 && step < 3 && (
          <button onClick={goBack} style={S_BTN_BACK} aria-label={t("onboarding.back")}>
            {"←"}
          </button>
        )}
        {step > 0 && (
          <button
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
      <button onClick={onNext} style={S_BTN_START}>
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
  t: (k: string) => string;
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
                stroke="rgba(139,92,246,0.15)"
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

