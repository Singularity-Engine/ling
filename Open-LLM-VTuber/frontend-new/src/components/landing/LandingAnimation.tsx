import { useState, useEffect, useCallback, useRef } from "react";
import { ParticleCanvas, type ParticlePhase } from "./ParticleCanvas";

interface LandingAnimationProps {
  onComplete: () => void;
}

const LINES = [
  "嘿，你来了。",
  "我叫灵。我能记住你，也会一直在这里。",
  "来，跟我聊聊？",
];






const TYPE_SPEED = 100; // ms per character
const LINE_DELAY = 600; // pause between lines

export function LandingAnimation({ onComplete }: LandingAnimationProps) {
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
    setTimeout(() => onComplete(), 500);
  }, [onComplete]);

  // Keyboard skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only skip on Escape or if button is already visible
      if (e.key === "Escape" || showButton) {
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSkip, showButton]);

  // Main timeline
  useEffect(() => {
    startTimeRef.current = performance.now();

    // Phase 0: float (0-2s) — already default
    // Phase 1: converge (2-4s)
    const convergeTimer = setTimeout(() => {
      setParticlePhase("converge");
    }, 2000);

    // Converge progress updates
    const convergeInterval = setInterval(() => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > 2000 && elapsed < 4000) {
        setPhaseProgress((elapsed - 2000) / 2000);
      }
    }, 16);

    // Phase 2: explode (4-4.5s)
    const explodeTimer = setTimeout(() => {
      setParticlePhase("explode");
      setFlashOpacity(0.8);
      // Flash fades
      setTimeout(() => setFlashOpacity(0), 400);
    }, 4000);

    // Phase 3+: text appears (4.5s+)
    const textTimer = setTimeout(() => {
      setParticlePhase("fade");
      setBgDim(0.6);
      setShowText(true);
    }, 4500);

    return () => {
      clearTimeout(convergeTimer);
      clearInterval(convergeInterval);
      clearTimeout(explodeTimer);
      clearTimeout(textTimer);
    };
  }, []);

  // Typewriter effect for current line
  useEffect(() => {
    if (!showText) return;
    if (currentLine >= LINES.length) {
      // All lines done → show button
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
      // Line complete, move to next after delay
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
        transition: "opacity 0.5s ease-out",
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
          background: "#fff",
          opacity: flashOpacity,
          transition: "opacity 0.4s ease-out",
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
            }}
          >
            {LINES.map((line, i) => {
              if (i > currentLine) return null;
              const chars =
                i < currentLine ? line.length : displayedChars;
              const text = line.slice(0, chars);
              const isActive = i === currentLine && chars < line.length;

              return (
                <div
                  key={i}
                  className="landing-text-line"
                  style={{
                    fontSize: i === 0 ? "28px" : "20px",
                    fontWeight: i === 0 ? 700 : 400,
                    color: i === 0 ? "#e2d4ff" : "rgba(255,255,255,0.8)",
                    letterSpacing: "0.05em",
                    textAlign: "center",
                    minHeight: i === 0 ? "36px" : "28px",
                    animation: "fadeInUp 0.5s ease-out both",
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  {text}
                  {isActive && (
                    <span
                      style={{
                        display: "inline-block",
                        width: "2px",
                        height: i === 0 ? "24px" : "18px",
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
            <button
              onClick={handleSkip}
              className="landing-start-btn"
              style={{
                marginTop: "48px",
                padding: "14px 48px",
                fontSize: "18px",
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                border: "none",
                borderRadius: "999px",
                cursor: "pointer",
                animation: "fadeInUp 0.6s ease-out both",
                boxShadow: "0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2)",
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow =
                  "0 0 40px rgba(139, 92, 246, 0.6), 0 0 80px rgba(139, 92, 246, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow =
                  "0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2)";
              }}
            >
              <span style={{ animation: "glowPulse 2s infinite" }}>
                开始对话
              </span>
            </button>
          )}
        </div>
      )}

      {/* Skip hint */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          color: "rgba(255,255,255,0.3)",
          fontSize: "12px",
          zIndex: 5,
          animation: "fadeInUp 1s ease-out 1s both",
        }}
      >
        按 ESC 跳过
      </div>
    </div>
  );
}
