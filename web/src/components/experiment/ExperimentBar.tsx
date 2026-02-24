/**
 * ExperimentBar — 灵的 AI 创业实验状态栏
 *
 * 固定在聊天界面顶部，显示：
 * - Day N（实验天数）
 * - 倒计时（剩余时间）
 * - 收入进度（$X / $36）
 * - 当前目标
 *
 * 从 /api/public/status 或本地 fallback 获取数据。
 */

import { useState, useEffect, useReducer, useRef, useMemo, memo, type CSSProperties } from "react";
import { SK_HAS_INTERACTED } from "@/constants/storage-keys";
// Keyframes & hover styles moved to static index.css — no runtime injection needed.

// ── Types ──

interface ExperimentStatus {
  alive: boolean;
  born: string;
  death_date: string;
  day_number: number;
  days_remaining: number;
  revenue: {
    total_usd: number;
    monthly_usd: number;
    target_monthly_usd: number;
    stage: string;
  };
  current_goal: string;
  season: number;
}

// ── Constants ──

const STATUS_API = "/data/status.json";

const FALLBACK: ExperimentStatus = {
  alive: true,
  born: "2026-02-21T13:43:45.004Z",
  death_date: "2026-04-25T13:43:45.004Z",
  day_number: 1,
  days_remaining: 63,
  revenue: { total_usd: 0, monthly_usd: 0, target_monthly_usd: 36, stage: "bootstrapping" },
  current_goal: "Survive",
  season: 1,
};

const REFRESH_MS = 5 * 60 * 1000; // 5 min

// ── Styles ──

const S_BAR: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: "8px 16px",
  background: "var(--ling-surface-deep)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderBottom: "1px solid var(--ling-purple-08)",
  fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
  fontSize: 12,
  color: "var(--ling-text-soft)",
  userSelect: "none",
};

const S_DAY: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--ling-purple-light)",
  background: "var(--ling-purple-12)",
  padding: "2px 10px",
  borderRadius: 100,
  letterSpacing: "0.02em",
};

const S_COUNTDOWN: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ling-text-secondary)",
  letterSpacing: "0.04em",
};

const S_COUNTDOWN_DANGER: CSSProperties = {
  ...S_COUNTDOWN,
  color: "var(--ling-error)",
};

const S_PROGRESS_WRAP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const S_PROGRESS_BAR: CSSProperties = {
  width: 60,
  height: 3,
  background: "var(--ling-surface-border)",
  borderRadius: 2,
  overflow: "hidden",
};

const S_PROGRESS_FILL_BASE: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, var(--ling-purple-light), var(--ling-purple-lighter))",
  borderRadius: 2,
  transition: "width 1s ease",
};

const S_REVENUE: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 11,
  color: "var(--ling-text-dim)",
};

const S_REVENUE_MINI: CSSProperties = { ...S_REVENUE, fontSize: 10 };

const S_SEP: CSSProperties = {
  width: 1,
  height: 12,
  background: "var(--ling-surface-border)",
};

const S_GOAL: CSSProperties = {
  fontSize: 11,
  color: "var(--ling-text-tertiary)",
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const S_LINK: CSSProperties = {
  fontSize: 11,
  color: "var(--ling-purple-light)",
  textDecoration: "none",
  fontWeight: 500,
  opacity: 0.8,
  transition: "opacity 0.2s",
};

// ── CountdownTimer: isolated re-renders at 1fps, avoids re-rendering the entire bar ──

function formatCountdown(deathDate: string): string {
  const diff = new Date(deathDate).getTime() - Date.now();
  if (diff <= 0) return "00:00:00:00";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(d).padStart(2, "0")}:${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const CountdownTimer = memo(function CountdownTimer({ deathDate, danger }: { deathDate: string; danger: boolean }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const text = formatCountdown(deathDate);
  const [d, h, m, s] = text.split(":");
  return (
    <span
      style={danger ? S_COUNTDOWN_DANGER : S_COUNTDOWN}
      role="timer"
      aria-label={`剩余 ${d}天 ${h}时 ${m}分 ${s}秒`}
    >
      {text}
    </span>
  );
});
CountdownTimer.displayName = "CountdownTimer";

// ── Component ──

const S_BAR_MINI: CSSProperties = {
  ...S_BAR,
  gap: 8,
  padding: "5px 16px",
  opacity: 0.7,
  animation: "connFadeIn 0.4s ease-out",
};

export const ExperimentBar = memo(function ExperimentBar() {
  const [status, setStatus] = useState<ExperimentStatus>(FALLBACK);

  // Progressive disclosure: show minimal bar until user has interacted
  const [hasInteracted, setHasInteracted] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(SK_HAS_INTERACTED) === "1"
  );

  // Listen for first message sent to mark as interacted
  useEffect(() => {
    if (hasInteracted) return;
    const handler = () => {
      localStorage.setItem(SK_HAS_INTERACTED, "1");
      setHasInteracted(true);
    };
    // Listen for custom event dispatched when user sends first message
    window.addEventListener("ling-user-interacted", handler);
    return () => window.removeEventListener("ling-user-interacted", handler);
  }, [hasInteracted]);

  // Fetch on mount + interval; AbortController cancels in-flight requests on unmount
  useEffect(() => {
    const ac = new AbortController();
    const doFetch = async () => {
      try {
        const r = await fetch(STATUS_API, { cache: "no-cache", signal: ac.signal });
        if (r.ok) setStatus(await r.json());
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // silently use fallback for network errors
      }
    };
    doFetch();
    const id = setInterval(doFetch, REFRESH_MS);
    return () => { clearInterval(id); ac.abort(); };
  }, []);

  const isDanger = status.days_remaining <= 7;
  const revPct = Math.min(
    ((status.revenue?.monthly_usd || 0) / (status.revenue?.target_monthly_usd || 36)) * 100,
    100
  );

  const progressFillStyle = useMemo<CSSProperties>(() => ({
    ...S_PROGRESS_FILL_BASE,
    width: `${Math.max(revPct, 2)}%`,
  }), [revPct]);

  // Minimal bar for new users — just Day badge
  if (!hasInteracted) {
    return (
      <div style={S_BAR_MINI} role="banner" aria-label="AI创业实验状态栏">
        <span style={S_DAY} aria-label={`实验第 ${status.day_number} 天`}>Day {status.day_number}</span>
        <span style={S_SEP} aria-hidden="true" />
        <span style={S_REVENUE_MINI}>{status.days_remaining}d left</span>
      </div>
    );
  }

  return (
    <div style={S_BAR} role="banner" aria-label="AI创业实验状态栏">
      {/* Day badge */}
      <span style={S_DAY} aria-label={`实验第 ${status.day_number} 天`}>Day {status.day_number}</span>

      <span style={S_SEP} aria-hidden="true" />

      {/* Countdown — isolated component, re-renders at 1fps independently */}
      <CountdownTimer deathDate={status.death_date} danger={isDanger} />

      <span style={S_SEP} aria-hidden="true" />

      {/* Revenue progress */}
      <div style={S_PROGRESS_WRAP} aria-label="月收入进度">
        <div
          style={S_PROGRESS_BAR}
          role="progressbar"
          aria-valuenow={status.revenue?.monthly_usd || 0}
          aria-valuemin={0}
          aria-valuemax={status.revenue?.target_monthly_usd || 36}
          aria-label={`月收入 $${status.revenue?.monthly_usd || 0} / $${status.revenue?.target_monthly_usd || 36}`}
        >
          <div style={progressFillStyle} />
        </div>
        <span style={S_REVENUE}>
          ${status.revenue?.monthly_usd || 0} / ${status.revenue?.target_monthly_usd || 36}
        </span>
      </div>

      <span style={S_SEP} aria-hidden="true" />

      {/* Current goal (desktop only) */}
      <span style={S_GOAL} className="experiment-bar-goal">
        {status.current_goal}
      </span>

      {/* Mission link — hover via CSS class, avoids inline event handler allocation */}
      <a
        href="https://ling.sngxai.com"
        target="_blank"
        rel="noopener noreferrer"
        className="experiment-bar-link"
        style={S_LINK}
        aria-label="查看灵的 AI 创业实验使命"
      >
        Mission
      </a>
    </div>
  );
});

export default ExperimentBar;
