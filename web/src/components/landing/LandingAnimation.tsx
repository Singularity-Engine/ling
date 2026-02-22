import { useTranslation } from "react-i18next";
import { memo, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface LandingAnimationProps {
  onComplete: () => void;
}


const TYPE_SPEED = 70; // ms per character — 更流畅的打字节奏
const LINE_DELAY = 500; // pause between lines

/* ── Module-level style constants ─────────────────────────── */

const rootStyleBase: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "linear-gradient(180deg, var(--ling-bg-deep) 0%, var(--ling-bg-mid) 50%, var(--ling-bg-warm) 100%)",
  overflow: "hidden",
  transition: "opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
};

const bgDimStyleBase: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--ling-bg-deep)",
  transition: "opacity 1s ease",
  zIndex: 2,
  pointerEvents: "none",
};

const flashStyleBase: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "radial-gradient(circle at 50% 50%, var(--ling-purple-lighter) 0%, var(--ling-purple-60) 50%, transparent 80%)",
  transition: "opacity 0.5s ease-out",
  zIndex: 3,
  pointerEvents: "none",
};

const textWrapperBase: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 4,
  padding: "0 24px",
  transition: "opacity 0.6s ease-out",
};

const textBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "16px",
  maxWidth: "min(90vw, 600px)",
};

// Per-line-index static properties (title / subtitle / tagline)
const lineStyleBase: React.CSSProperties[] = [
  { fontSize: "clamp(3rem, 7vw, 4.5rem)", fontWeight: 700, letterSpacing: "0.12em", textAlign: "center", wordBreak: "break-word", minHeight: "4.5rem", marginTop: "0", transition: "opacity 0.5s ease-out, transform 0.5s ease-out" },
  { fontSize: "1.4rem", fontWeight: 500, letterSpacing: "0.04em", textAlign: "center", wordBreak: "break-word", minHeight: "1.75rem", marginTop: "8px", transition: "opacity 0.5s ease-out, transform 0.5s ease-out" },
  { fontSize: "1.25rem", fontWeight: 400, letterSpacing: "0.04em", textAlign: "center", wordBreak: "break-word", minHeight: "1.75rem", marginTop: "28px", transition: "opacity 0.5s ease-out, transform 0.5s ease-out" },
];

// Precomputed line×state styles (9 total) to avoid allocations in the 70ms typewriter hot loop.
// States: hidden (i > currentLine), typing (i === currentLine), complete (i < currentLine).
const LINE_STATE_STYLES: Record<"hidden" | "typing" | "complete", React.CSSProperties>[] = [
  // Line 0 — title (color handled by .landing-title-gradient CSS class)
  {
    hidden:   { ...lineStyleBase[0], opacity: 0, transform: "translateY(12px)", textShadow: "none" },
    typing:   { ...lineStyleBase[0], opacity: 1, transform: "translateY(0)", textShadow: "0 0 20px var(--ling-purple-25)" },
    complete: { ...lineStyleBase[0], opacity: 1, transform: "translateY(0)" },
  },
  // Line 1 — subtitle
  {
    hidden:   { ...lineStyleBase[1], color: "var(--ling-text-secondary)", opacity: 0, transform: "translateY(12px)", textShadow: "none" },
    typing:   { ...lineStyleBase[1], color: "var(--ling-text-secondary)", opacity: 1, transform: "translateY(0)", textShadow: "none" },
    complete: { ...lineStyleBase[1], color: "var(--ling-text-secondary)", opacity: 1, transform: "translateY(0)", textShadow: "0 0 20px var(--ling-purple-20)" },
  },
  // Line 2 — tagline (last line)
  {
    hidden:   { ...lineStyleBase[2], color: "var(--ling-purple-lighter)", opacity: 0, transform: "translateY(12px)", textShadow: "none" },
    typing:   { ...lineStyleBase[2], color: "var(--ling-purple-lighter)", opacity: 1, transform: "translateY(0)", textShadow: "none" },
    complete: { ...lineStyleBase[2], color: "var(--ling-purple-lighter)", opacity: 1, transform: "translateY(0)", textShadow: "0 0 20px var(--ling-purple-20)" },
  },
];

const cursorStyleTitle: React.CSSProperties = {
  display: "inline-block",
  width: "2px",
  height: "2rem",
  background: "var(--ling-purple)",
  marginLeft: "2px",
  verticalAlign: "middle",
  animation: "blink 1s infinite",
};

const cursorStyleNormal: React.CSSProperties = {
  display: "inline-block",
  width: "2px",
  height: "1.125rem",
  background: "var(--ling-purple)",
  marginLeft: "2px",
  verticalAlign: "middle",
  animation: "blink 1s infinite",
};

const buttonContainerBase: React.CSSProperties = {
  marginTop: "48px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "16px",
  transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const startBtnBase: React.CSSProperties = {
  padding: "16px 48px",
  fontSize: "1.125rem",
  fontWeight: 600,
  color: "#fff",
  background: "linear-gradient(135deg, var(--ling-purple) 0%, var(--ling-purple-deep) 100%)",
  border: "1px solid var(--ling-purple-30)",
  borderRadius: "999px",
  boxShadow: "0 0 30px var(--ling-purple-40), 0 0 60px var(--ling-purple-20), inset 0 1px 0 rgba(255,255,255,0.15)",
  transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: "16px",
  height: "16px",
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  animation: "landingBtnSpin 0.6s linear infinite",
};

const arrowStyle: React.CSSProperties = { fontSize: "1.1em", opacity: 0.8, transition: "transform 0.25s ease" };

const hintStyle: React.CSSProperties = { fontSize: "0.75rem", color: "var(--ling-text-tertiary)", letterSpacing: "0.04em" };

const skipStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "max(16px, env(safe-area-inset-bottom, 0px))",
  right: "16px",
  color: "var(--ling-text-tertiary)",
  fontSize: "0.75rem",
  zIndex: 5,
  animation: "fadeInUp 1s ease-out 1s both",
  cursor: "pointer",
  minWidth: "48px",
  minHeight: "48px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 16px",
};

export const LandingAnimation = memo(function LandingAnimation({ onComplete }: LandingAnimationProps) {
  const { t } = useTranslation();
  const LINES = useMemo(() => [t("landing.line1"), t("landing.line2"), t("landing.line3")], [t]);
  const [particlePhase, setParticlePhase] = useState<ParticlePhase>("float");
  const phaseProgressRef = useRef(0);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [showText, setShowText] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [bgDim, setBgDim] = useState(0);
  const [exiting, setExiting] = useState(false);
  const startTimeRef = useRef(0);
  const skippedRef = useRef(false);

  // Skip handler
  const handleSkip = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setExiting(true);
    onComplete(); // Fire immediately — cross-dissolve with main content
  }, [onComplete]);

  // Keyboard skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (showButton && (e.key === "Enter" || e.key === " "))) {
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSkip, showButton]);

  // Main timeline — 压缩到 3.0s 开始出文字（更快触达内容）
  // reduced-motion: 跳过粒子动画，直接显示文字
  useEffect(() => {
    if (prefersReducedMotion()) {
      setParticlePhase("fade");
      setBgDim(0.6);
      setShowText(true);
      setCurrentLine(LINES.length); // 跳过打字机，直接全部显示
      return;
    }

    startTimeRef.current = performance.now();

    // Phase 1: converge (1.2-2.5s)
    const convergeTimer = setTimeout(() => {
      setParticlePhase("converge");
    }, 1200);

    let convergeRafId = 0;
    const updateProgress = () => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > 1200 && elapsed < 2500) {
        phaseProgressRef.current = (elapsed - 1200) / 1300;
        convergeRafId = requestAnimationFrame(updateProgress);
      } else if (elapsed >= 2500) {
        phaseProgressRef.current = 1;
      } else {
        convergeRafId = requestAnimationFrame(updateProgress);
      }
    };
    convergeRafId = requestAnimationFrame(updateProgress);

    // Phase 2: explode (2.5-3.0s)
    let flashTimer: ReturnType<typeof setTimeout>;
    const explodeTimer = setTimeout(() => {
      setParticlePhase("explode");
      setFlashOpacity(0.8);
      flashTimer = setTimeout(() => setFlashOpacity(0), 400);
    }, 2500);

    // Phase 3: text (3.0s+)
    const textTimer = setTimeout(() => {
      setParticlePhase("fade");
      setBgDim(0.6);
      setShowText(true);
    }, 3000);

    return () => {
      clearTimeout(convergeTimer);
      cancelAnimationFrame(convergeRafId);
      clearTimeout(explodeTimer);
      clearTimeout(flashTimer);
      clearTimeout(textTimer);
    };
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (!showText) return;
    if (currentLine >= LINES.length) {
      const t = setTimeout(() => setShowButton(true), 400);
      return () => clearTimeout(t);
    }

    const line = LINES[currentLine];
    if (displayedChars < line.length) {
      const t = setTimeout(
        () => setDisplayedChars((c) => c + 1),
        TYPE_SPEED
      );
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setCurrentLine((l) => l + 1);
        setDisplayedChars(0);
      }, LINE_DELAY);
      return () => clearTimeout(t);
    }
  }, [showText, currentLine, displayedChars, LINES]);

  // Dynamic styles — memoized to avoid per-render allocations
  const rootStyle = useMemo<React.CSSProperties>(
    () => ({ ...rootStyleBase, opacity: exiting ? 0 : 1, transform: exiting ? "scale(1.04)" : "scale(1)" }),
    [exiting],
  );

  const bgDimStyle = useMemo<React.CSSProperties>(
    () => ({ ...bgDimStyleBase, opacity: bgDim }),
    [bgDim],
  );

  const flashStyle = useMemo<React.CSSProperties>(
    () => ({ ...flashStyleBase, opacity: flashOpacity }),
    [flashOpacity],
  );

  const textWrapperStyle = useMemo<React.CSSProperties>(
    () => ({ ...textWrapperBase, opacity: showText ? 1 : 0, pointerEvents: showText ? "auto" : "none" }),
    [showText],
  );

  const btnContainerStyle = useMemo<React.CSSProperties>(
    () => ({
      ...buttonContainerBase,
      opacity: showButton ? 1 : 0,
      transform: showButton ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
      pointerEvents: showButton ? "auto" : "none",
    }),
    [showButton],
  );

  const startBtnStyle = useMemo<React.CSSProperties>(
    () => ({ ...startBtnBase, cursor: exiting ? "default" : "pointer", opacity: exiting ? 0.85 : 1 }),
    [exiting],
  );

  return (
    <div data-landing style={rootStyle}>
      {/* Particle canvas */}
      <ParticleCanvas phase={particlePhase} phaseProgressRef={phaseProgressRef} />

      {/* Background dim overlay */}
      <div style={bgDimStyle} />

      {/* Flash overlay */}
      <div style={flashStyle} />

      {/* Text content — always rendered to avoid FOUC; opacity controls visibility */}
      <div style={textWrapperStyle}>
        <div className="landing-text-block" style={textBlockStyle}>
          {LINES.map((line, i) => {
            const isComplete = i < currentLine;
            const state = isComplete ? "complete" : i === currentLine ? "typing" : "hidden";
            const chars = isComplete ? line.length : i === currentLine ? displayedChars : 0;
            const text = line.slice(0, chars);
            const isActive = i === currentLine && chars < line.length;

            return (
              <div
                key={i}
                className={`landing-text-line${i === 0 ? " landing-title-gradient" : ""}${i === 0 && isComplete ? " landing-title-glow" : ""}`}
                style={LINE_STATE_STYLES[i][state]}
              >
                {text}
                {isActive && (
                  <span style={i === 0 ? cursorStyleTitle : cursorStyleNormal} />
                )}
              </div>
            );
          })}
        </div>

        {/* Start button — container always rendered to prevent layout shift */}
        <div style={btnContainerStyle}>
          <button
            onClick={handleSkip}
            className="landing-start-btn"
            disabled={exiting || !showButton}
            tabIndex={showButton ? 0 : -1}
            style={startBtnStyle}
          >
            {exiting && <span style={spinnerStyle} />}
            {t("landing.startChat")}
            {!exiting && (
              <span className="landing-btn-arrow" style={arrowStyle}>
                {"\u2192"}
              </span>
            )}
          </button>
          <span style={hintStyle}>
            <span className="landing-hint-mobile">{t("landing.tapHint", "Tap to start")}</span>
            <span className="landing-hint-desktop">Press Enter ↵</span>
          </span>
          {/* Feature pills */}
          <div className="landing-feature-pills">
            {(["featureMemory", "featureVoice", "featureAvatar"] as const).map((key) => (
              <span key={key} className="landing-feature-pill">
                {t(`landing.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Skip hint — 移动端友好触摸区域 */}
      <div onClick={handleSkip} className="landing-skip" style={skipStyle}>
        {t("landing.skip")}
      </div>

    </div>
  );
});
