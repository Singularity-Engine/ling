/**
 * PersonalizedOnboarding - 个性化引导流程
 *
 * 4 步交互式引导：Welcome → About You → Your Goals → Ready
 * 收集用户兴趣和目标 skills → 种子星座 + 灵人格定制
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  LuPalette, LuCode, LuBookOpen, LuBriefcase,
  LuGamepad2, LuGlobe, LuCheck,
} from "react-icons/lu";
import { getSkillsByTags, getMetaByKey, type SkillMeta } from "../../config/skill-registry";
import { useConstellation } from "../../hooks/use-constellation";

const STORAGE_KEY = "ling-onboarding-done";
const PREFS_KEY = "ling-user-preferences";

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
    <div
      style={{
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
        opacity: exiting ? 0 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      {/* Progress dots */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? "24px" : "8px",
              height: "8px",
              borderRadius: "4px",
              background: i === step ? "#8b5cf6" : i < step ? "#6d28d9" : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
            }}
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
          style={{
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
          }}
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
      <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
        <button
          onClick={skip}
          style={{
            padding: "12px 24px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent",
            color: "rgba(255,255,255,0.4)",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {t("onboarding.skip")}
        </button>
        {step > 0 && step < 3 && (
          <button
            onClick={goBack}
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.6)",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {"←"}
          </button>
        )}
        {step > 0 && (
          <button
            onClick={step === 3 ? finish : goNext}
            style={{
              padding: "12px 32px",
              borderRadius: "12px",
              border: "none",
              background: "#8b5cf6",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
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
      <div style={{ marginBottom: "24px" }}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(196,181,253,0.8)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,0.5))" }}
        >
          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" />
        </svg>
      </div>
      <h2 style={{
        color: "#fff", fontSize: "28px", fontWeight: 700,
        margin: "0 0 12px", lineHeight: 1.3,
      }}>
        {t("onboarding.welcome")}
      </h2>
      <p style={{
        color: "rgba(255,255,255,0.5)", fontSize: "15px",
        lineHeight: 1.7, margin: "0 0 32px", maxWidth: "360px",
        marginLeft: "auto", marginRight: "auto",
      }}>
        {t("onboarding.welcomeSub")}
      </p>
      <button
        onClick={onNext}
        style={{
          padding: "14px 36px", borderRadius: "12px",
          border: "none", background: "#8b5cf6", color: "#fff",
          fontSize: "15px", fontWeight: 600, cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        {t("onboarding.start")}
      </button>
    </>
  );
}

// ── Step 1: Interests ───────────────────────────────────────────
function StepInterests({
  t, selected, onToggle,
}: {
  t: (k: string) => string;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <>
      <h2 style={{
        color: "#fff", fontSize: "24px", fontWeight: 700,
        margin: "0 0 8px",
      }}>
        {t("onboarding.aboutYou")}
      </h2>
      <p style={{
        color: "rgba(255,255,255,0.4)", fontSize: "14px",
        margin: "0 0 28px",
      }}>
        {t("onboarding.aboutYouSub")}
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        maxWidth: "min(400px, 100%)",
        margin: "0 auto",
      }}>
        {INTERESTS.map(({ tag, icon: Icon, color }) => {
          const isSelected = selected.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              style={{
                position: "relative",
                padding: "20px 12px",
                borderRadius: "16px",
                border: `1.5px solid ${isSelected ? `${color}80` : "rgba(255,255,255,0.1)"}`,
                background: isSelected ? `${color}20` : "rgba(255,255,255,0.06)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                font: "inherit",
                color: "inherit",
              }}
            >
              <Icon size={24} color={isSelected ? color : "rgba(255,255,255,0.5)"} />
              <span style={{
                fontSize: "13px",
                color: isSelected ? color : "rgba(255,255,255,0.6)",
                fontWeight: isSelected ? 600 : 400,
              }}>
                {t(`onboarding.interests.${tag}`)}
              </span>
              {isSelected && (
                <div style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
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
      <h2 style={{
        color: "#fff", fontSize: "24px", fontWeight: 700,
        margin: "0 0 8px",
      }}>
        {t("onboarding.goals")}
      </h2>
      <p style={{
        color: "rgba(255,255,255,0.4)", fontSize: "14px",
        margin: "0 0 24px",
      }}>
        {t("onboarding.goalsSub")}
      </p>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "10px",
        justifyContent: "center",
        maxWidth: "min(440px, 100%)",
        margin: "0 auto",
      }}>
        {/* Memory — always included, not toggleable */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "14px",
            border: `1.5px solid ${memoryMeta.color}80`,
            background: `${memoryMeta.color}20`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
          }}
        >
          <memoryMeta.icon size={20} color={memoryMeta.color} />
          <div style={{ textAlign: "left", flex: 1 }}>
            <span style={{ fontSize: "14px", color: memoryMeta.color, fontWeight: 600 }}>
              {memoryMeta.label[lang as "en" | "zh"]}
            </span>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
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
              style={{
                position: "relative",
                padding: "12px 18px",
                borderRadius: "14px",
                border: `1.5px solid ${isSelected ? `${meta.color}80` : "rgba(255,255,255,0.1)"}`,
                background: isSelected ? `${meta.color}20` : "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: isFull ? "not-allowed" : "pointer",
                opacity: isFull ? 0.4 : 1,
                transition: "all 0.2s ease",
                font: "inherit",
                color: "inherit",
              }}
            >
              <Icon size={18} color={isSelected ? meta.color : "rgba(255,255,255,0.5)"} />
              <span style={{
                fontSize: "13px",
                color: isSelected ? meta.color : "rgba(255,255,255,0.6)",
                fontWeight: isSelected ? 600 : 400,
              }}>
                {meta.label[lang as "en" | "zh"]}
              </span>
              {isSelected && (
                <LuCheck size={14} color={meta.color} style={{ marginLeft: 4 }} />
              )}
            </button>
          );
        })}
      </div>

      {selected.length >= MAX_GOALS && (
        <p style={{
          fontSize: "12px", color: "rgba(255,255,255,0.3)",
          marginTop: "12px",
        }}>
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
  return (
    <>
      <h2 style={{
        color: "#fff", fontSize: "28px", fontWeight: 700,
        margin: "0 0 12px",
      }}>
        {t("onboarding.ready")}
      </h2>
      <p style={{
        color: "rgba(255,255,255,0.5)", fontSize: "15px",
        margin: "0 0 28px",
      }}>
        {t("onboarding.readySub")}
      </p>

      {/* Mini constellation preview */}
      <div style={{
        position: "relative",
        width: "200px",
        height: "200px",
        margin: "0 auto 24px",
      }}>
        {goals.map((key, i) => {
          const meta = getMetaByKey(key);
          const Icon = meta.icon;
          const total = goals.length;
          const angle = (-180 + i * (150 / Math.max(total - 1, 1))) * (Math.PI / 180);
          const r = 70;
          const cx = 100 + r * Math.cos(angle);
          const cy = 100 + r * Math.sin(angle);

          return (
            <motion.div
              key={key}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 300 }}
              style={{
                position: "absolute",
                left: cx - 18,
                top: cy - 18,
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: `radial-gradient(circle at 30% 30%, ${meta.color}30, rgba(10,0,21,0.6))`,
                border: `1.5px solid ${meta.color}66`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 12px ${meta.color}33`,
              }}
            >
              <Icon size={16} color={meta.color} />
            </motion.div>
          );
        })}

        {/* Connection lines SVG */}
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {goals.map((_, i) => {
            if (i === goals.length - 1) return null;
            const total = goals.length;
            const a1 = (-180 + i * (150 / Math.max(total - 1, 1))) * (Math.PI / 180);
            const a2 = (-180 + (i + 1) * (150 / Math.max(total - 1, 1))) * (Math.PI / 180);
            const r = 70;
            return (
              <motion.line
                key={i}
                x1={100 + r * Math.cos(a1)}
                y1={100 + r * Math.sin(a1)}
                x2={100 + r * Math.cos(a2)}
                y2={100 + r * Math.sin(a2)}
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

      <p style={{
        fontSize: "13px", color: "rgba(255,255,255,0.3)",
        fontStyle: "italic",
      }}>
        {t("onboarding.readyHint")}
      </p>
    </>
  );
}

/** Check if onboarding has been completed this session */
export function shouldShowOnboarding(): boolean {
  return !sessionStorage.getItem(STORAGE_KEY);
}
