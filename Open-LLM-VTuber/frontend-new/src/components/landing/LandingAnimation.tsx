import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";

interface LandingAnimationProps {
  onComplete: () => void;
}


const TYPE_SPEED = 70; // ms per character — 更流畅的打字节奏
const LINE_DELAY = 500; // pause between lines

export function LandingAnimation({ onComplete }: LandingAnimationProps) {
  const { t } = useTranslation();
  const LINES = useMemo(() => [t("landing.line1"), t("landing.line2"), t("landing.line3")], [t]);
  const [particlePhase, setParticlePhase] = useState<ParticlePhase>("float");
  const [phaseProgress, setPhaseProgress] = useState(0);
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
    setTimeout(() => onComplete(), 400);
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
  useEffect(() => {
    startTimeRef.current = performance.now();

    // Phase 1: converge (1.5-3s)
    const convergeTimer = setTimeout(() => {
      setParticlePhase("converge");
    }, 1500);

    const convergeInterval = setInterval(() => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > 1500 && elapsed < 3000) {
        setPhaseProgress((elapsed - 1500) / 1500);
      }
    }, 16);

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
      clearInterval(convergeInterval);
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
  }, [showText, currentLine, displayedChars]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(180deg, #0a0015 0%, #0d1b2a 50%, #1a0a2e 100%)",
        overflow: "hidden",
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(1.04)" : "scale(1)",
        transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Particle canvas */}
      <ParticleCanvas phase={particlePhase} phaseProgress={phaseProgress} />

      {/* Background dim overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: `rgba(10, 0, 21, ${bgDim})`,
          transition: "background 1s ease",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Flash overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.95) 0%, rgba(139, 92, 246, 0.6) 50%, transparent 80%)",
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
              if (i > currentLine) return null;
              const chars =
                i < currentLine ? line.length : displayedChars;
              const text = line.slice(0, chars);
              const isActive = i === currentLine && chars < line.length;
              const isComplete = i < currentLine;
              const isLastLine = i === LINES.length - 1;

              return (
                <div
                  key={i}
                  className="landing-text-line"
                  style={{
                    fontSize: i === 0 ? "30px" : isLastLine ? "22px" : "18px",
                    fontWeight: i === 0 ? 700 : isLastLine ? 500 : 400,
                    color: i === 0
                      ? "#e2d4ff"
                      : isLastLine
                        ? "rgba(196, 181, 253, 0.95)"
                        : "rgba(255,255,255,0.6)",
                    letterSpacing: i === 0 ? "0.08em" : "0.04em",
                    textAlign: "center",
                    wordBreak: "break-word" as const,
                    minHeight: i === 0 ? "40px" : "28px",
                    marginTop: isLastLine ? "8px" : "0",
                    animation: "fadeInUp 0.5s ease-out both",
                    animationDelay: `${i * 0.1}s`,
                    textShadow: isComplete
                      ? i === 0
                        ? "0 0 30px rgba(139, 92, 246, 0.4)"
                        : "0 0 20px rgba(139, 92, 246, 0.2)"
                      : "none",
                    transition: "text-shadow 0.8s ease",
                  }}
                >
                  {text}
                  {isActive && (
                    <span
                      style={{
                        display: "inline-block",
                        width: "2px",
                        height: i === 0 ? "26px" : "18px",
                        background: "#8b5cf6",
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

          {/* Start button */}
          {showButton && (
            <div style={{ marginTop: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", animation: "fadeInUp 0.6s ease-out both" }}>
              <button
                onClick={handleSkip}
                className="landing-start-btn"
                disabled={exiting}
                style={{
                  padding: "15px 52px",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#fff",
                  background: exiting
                    ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
                    : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)",
                  border: "1px solid rgba(167, 139, 250, 0.3)",
                  borderRadius: "999px",
                  cursor: exiting ? "default" : "pointer",
                  animation: exiting ? "none" : "breatheGlow 3s ease-in-out infinite",
                  boxShadow: exiting
                    ? "0 0 20px rgba(139, 92, 246, 0.3)"
                    : "0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, opacity 0.2s ease",
                  position: "relative",
                  overflow: "hidden",
                  opacity: exiting ? 0.85 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
                onMouseEnter={(e) => {
                  if (exiting) return;
                  e.currentTarget.style.transform = "scale(1.06)";
                  e.currentTarget.style.boxShadow =
                    "0 0 45px rgba(139, 92, 246, 0.6), 0 0 90px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  if (exiting) return;
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow =
                    "0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)";
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
              </button>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}>
                Press Enter ↵
              </span>
            </div>
          )}
        </div>
      )}

      {/* Skip hint — 移动端友好触摸区域 */}
      <div
        onClick={handleSkip}
        style={{
          position: "fixed",
          bottom: "max(16px, env(safe-area-inset-bottom, 0px))",
          right: "16px",
          color: "rgba(255,255,255,0.3)",
          fontSize: "13px",
          zIndex: 5,
          animation: "fadeInUp 1s ease-out 1s both",
          cursor: "pointer",
          minWidth: "48px",
          minHeight: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 12px",
        }}
      >
        {t("landing.skip")}
      </div>

      {/* 呼吸光效 keyframes */}
      <style>{`
        @keyframes breatheGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2); }
          50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6), 0 0 80px rgba(139, 92, 246, 0.3); }
        }
        @keyframes landingBtnSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
