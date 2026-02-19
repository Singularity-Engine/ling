import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";
import { MOBILE_BREAKPOINT } from "@/constants/breakpoints";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface LandingAnimationProps {
  onComplete: () => void;
}


const TYPE_SPEED = 70; // ms per character — 更流畅的打字节奏
const LINE_DELAY = 500; // pause between lines

export function LandingAnimation({ onComplete }: LandingAnimationProps) {
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

  // Main timeline — 压缩到 3.5s 开始出文字
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

    // Phase 1: converge (1.5-3s)
    const convergeTimer = setTimeout(() => {
      setParticlePhase("converge");
    }, 1500);

    let convergeRafId = 0;
    const updateProgress = () => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > 1500 && elapsed < 3000) {
        phaseProgressRef.current = (elapsed - 1500) / 1500;
        convergeRafId = requestAnimationFrame(updateProgress);
      } else if (elapsed >= 3000) {
        phaseProgressRef.current = 1;
      } else {
        convergeRafId = requestAnimationFrame(updateProgress);
      }
    };
    convergeRafId = requestAnimationFrame(updateProgress);

    // Phase 2: explode (3-3.5s)
    const explodeTimer = setTimeout(() => {
      setParticlePhase("explode");
      setFlashOpacity(0.8);
      setTimeout(() => setFlashOpacity(0), 400);
    }, 3000);

    // Phase 3: text (3.5s+)
    const textTimer = setTimeout(() => {
      setParticlePhase("fade");
      setBgDim(0.6);
      setShowText(true);
    }, 3500);

    return () => {
      clearTimeout(convergeTimer);
      cancelAnimationFrame(convergeRafId);
      clearTimeout(explodeTimer);
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

  return (
    <div
      data-landing
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(180deg, var(--ling-bg-deep) 0%, var(--ling-bg-mid) 50%, var(--ling-bg-warm) 100%)",
        overflow: "hidden",
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(1.04)" : "scale(1)",
        transition: "opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Particle canvas */}
      <ParticleCanvas phase={particlePhase} phaseProgressRef={phaseProgressRef} />

      {/* Background dim overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--ling-bg-deep)",
          opacity: bgDim,
          transition: "opacity 1s ease",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Flash overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, var(--ling-purple-lighter) 0%, var(--ling-purple-60) 50%, transparent 80%)",
          opacity: flashOpacity,
          transition: "opacity 0.5s ease-out",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />

      {/* Text content */}
      {showText && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
            padding: "0 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              maxWidth: "min(90vw, 600px)",
            }}
          >
            {LINES.map((line, i) => {
              const isVisible = i <= currentLine;
              const chars =
                i < currentLine ? line.length : i === currentLine ? displayedChars : 0;
              const text = line.slice(0, chars);
              const isActive = i === currentLine && chars < line.length;
              const isComplete = i < currentLine;
              const isLastLine = i === LINES.length - 1;

              return (
                <div
                  key={i}
                  className={`landing-text-line${i === 0 ? " landing-title-gradient" : ""}${i === 0 && isComplete ? " landing-title-glow" : ""}`}
                  style={{
                    fontSize: i === 0 ? "3.75rem" : i === 1 ? "1.4rem" : "1.25rem",
                    fontWeight: i === 0 ? 700 : i === 1 ? 500 : 400,
                    color: i === 0
                      ? undefined  // handled by .landing-title-gradient
                      : isLastLine
                        ? "var(--ling-purple-lighter)"
                        : "var(--ling-text-secondary)",
                    letterSpacing: i === 0 ? "0.12em" : "0.04em",
                    textAlign: "center",
                    wordBreak: "break-word" as const,
                    minHeight: i === 0 ? "4.5rem" : "1.75rem",
                    marginTop: i === 1 ? "8px" : isLastLine ? "28px" : "0",
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(12px)",
                    transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
                    textShadow: i === 0
                      ? isComplete
                        ? undefined  // handled by .landing-title-glow animation
                        : isVisible
                          ? "0 0 20px var(--ling-purple-25)"
                          : "none"
                      : isComplete
                        ? "0 0 20px var(--ling-purple-20)"
                        : "none",
                  }}
                >
                  {text}
                  {isActive && (
                    <span
                      style={{
                        display: "inline-block",
                        width: "2px",
                        height: i === 0 ? "2rem" : "1.125rem",
                        background: "var(--ling-purple)",
                        marginLeft: "2px",
                        verticalAlign: "middle",
                        animation: "blink 1s infinite",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Start button — container always rendered to prevent layout shift */}
          <div style={{
            marginTop: "48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            opacity: showButton ? 1 : 0,
            transform: showButton ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
            transition: "opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
            pointerEvents: showButton ? "auto" : "none",
          }}>
            <button
              onClick={handleSkip}
              className="landing-start-btn"
              disabled={exiting || !showButton}
              tabIndex={showButton ? 0 : -1}
              style={{
                padding: "16px 48px",
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, var(--ling-purple) 0%, var(--ling-purple-deep) 100%)",
                border: "1px solid var(--ling-purple-30)",
                borderRadius: "999px",
                cursor: exiting ? "default" : "pointer",
                boxShadow: "0 0 30px var(--ling-purple-40), 0 0 60px var(--ling-purple-20), inset 0 1px 0 rgba(255,255,255,0.15)",
                transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
                position: "relative",
                opacity: exiting ? 0.85 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {exiting && (
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "landingBtnSpin 0.6s linear infinite",
                  }}
                />
              )}
              {t("landing.startChat")}
              {!exiting && (
                <span className="landing-btn-arrow" style={{ fontSize: "1.1em", opacity: 0.8, transition: "transform 0.25s ease" }}>
                  {"\u2192"}
                </span>
              )}
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--ling-text-tertiary)", letterSpacing: "0.04em" }}>
              {window.innerWidth < MOBILE_BREAKPOINT ? t("landing.tapHint", "Tap to start") : "Press Enter ↵"}
            </span>
          </div>
        </div>
      )}

      {/* Skip hint — 移动端友好触摸区域 */}
      <div
        onClick={handleSkip}
        className="landing-skip"
        style={{
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
        }}
      >
        {t("landing.skip")}
      </div>

    </div>
  );
}
