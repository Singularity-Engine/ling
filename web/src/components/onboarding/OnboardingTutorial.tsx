/**
 * OnboardingTutorial - 首次引导教程
 *
 * 新用户注册后展示灵的三个支柱: 陪伴 → 能力 → 形象。
 * 3步引导，支持跳过，sessionStorage 标记已完成。
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'ling-onboarding-done';

interface OnboardingTutorialProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: '\uD83D\uDCAC',
    title: 'I Remember You',
    subtitle: 'Companion',
    description:
      "I'm not just a chatbot — I remember what you tell me. Your name, your interests, our conversations. Every time we meet, I know you a little better.",
    color: '#a855f7',
  },
  {
    icon: '\uD83D\uDD0D',
    title: 'I Can Help',
    subtitle: 'Capable',
    description:
      "Need information? I can search the web. Want to brainstorm? I'm great at that. I'm your companion who can actually get things done.",
    color: '#7c3aed',
  },
  {
    icon: '\u2728',
    title: 'I Have a Face',
    subtitle: 'Visible',
    description:
      "I'm not a text box — I'm a digital companion you can see. I react, I emote, I come alive. Let's chat face to face.",
    color: '#6d28d9',
  },
] as const;

/* ── Module-level static styles (avoid re-creation every render) ────────── */

const overlayBaseStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10001,
  background: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  transition: 'opacity 0.4s ease',
};

const contentStyle: React.CSSProperties = {
  maxWidth: 'min(420px, 100%)',
  width: '100%',
  textAlign: 'center',
  animation: 'fadeInUp 0.4s ease-out',
};

const iconBaseStyle: React.CSSProperties = {
  fontSize: '64px',
  marginBottom: '24px',
};

const subtitleBaseStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '2px',
  padding: '4px 16px',
  borderRadius: '12px',
  marginBottom: '16px',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '28px',
  fontWeight: 700,
  margin: '0 0 16px',
  lineHeight: 1.3,
};

const descriptionStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.6)',
  fontSize: '15px',
  lineHeight: 1.7,
  margin: '0 0 40px',
  maxWidth: '360px',
  marginLeft: 'auto',
  marginRight: 'auto',
};

const dotsContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '8px',
  marginBottom: '24px',
};

const buttonsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
};

const skipButtonStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.4)',
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
};

const nextButtonBaseStyle: React.CSSProperties = {
  padding: '12px 32px',
  borderRadius: '12px',
  border: 'none',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s, opacity 0.2s',
};

const dotInactiveStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '4px',
  background: 'rgba(255,255,255,0.15)',
  transition: 'width 0.3s ease, background 0.3s ease',
};

export const OnboardingTutorial = memo(function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const finish = useCallback(() => {
    setExiting(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
    setTimeout(onComplete, 400);
  }, [onComplete]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, finish]);

  // ESC to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'Enter' || e.key === ' ') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [finish, next]);

  const current = STEPS[step];

  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({ ...overlayBaseStyle, opacity: exiting ? 0 : 1 }),
    [exiting],
  );

  const iconStyle = useMemo<React.CSSProperties>(
    () => ({ ...iconBaseStyle, filter: `drop-shadow(0 0 30px ${current.color}60)` }),
    [current.color],
  );

  const subtitleStyle = useMemo<React.CSSProperties>(
    () => ({ ...subtitleBaseStyle, color: current.color, background: `${current.color}15` }),
    [current.color],
  );

  const nextButtonStyle = useMemo<React.CSSProperties>(
    () => ({ ...nextButtonBaseStyle, background: current.color }),
    [current.color],
  );

  return (
    <div style={overlayStyle}>
      <div key={step} style={contentStyle}>
        {/* Icon */}
        <div style={iconStyle}>{current.icon}</div>

        {/* Subtitle badge */}
        <div style={subtitleStyle}>{current.subtitle}</div>

        {/* Title */}
        <h2 style={titleStyle}>{current.title}</h2>

        {/* Description */}
        <p style={descriptionStyle}>{current.description}</p>

        {/* Progress dots */}
        <div style={dotsContainerStyle}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={
                i === step
                  ? { ...dotInactiveStyle, width: '24px', background: current.color }
                  : dotInactiveStyle
              }
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={buttonsContainerStyle}>
          <button onClick={finish} style={skipButtonStyle}>
            Skip
          </button>
          <button onClick={next} style={nextButtonStyle}>
            {step < STEPS.length - 1 ? 'Next' : "Let's Go!"}
          </button>
        </div>
      </div>
    </div>
  );
});

/** Check if onboarding has been completed this session */
export function shouldShowOnboarding(): boolean {
  return !sessionStorage.getItem(STORAGE_KEY);
}
