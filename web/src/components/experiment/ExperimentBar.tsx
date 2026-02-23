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

const STATUS_API = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "/api/status.json";
  return "https://sngxai.com/api/status.json";
})();

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
  background: "rgba(8, 8, 13, 0.85)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderBottom: "1px solid rgba(167, 139, 250, 0.1)",
  fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
  fontSize: 12,
  color: "rgba(255,255,255,0.6)",
  userSelect: "none",
};

const S_DAY: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 11,
  fontWeight: 600,
  color: "#a78bfa",
  background: "rgba(167, 139, 250, 0.12)",
  padding: "2px 10px",
  borderRadius: 100,
  letterSpacing: "0.02em",
};

const S_COUNTDOWN: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 12,
  fontWeight: 500,
  color: "rgba(255,255,255,0.8)",
  letterSpacing: "0.04em",
};

const S_COUNTDOWN_DANGER: CSSProperties = {
  ...S_COUNTDOWN,
  color: "#f87171",
};

const S_PROGRESS_WRAP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const S_PROGRESS_BAR: CSSProperties = {
  width: 60,
  height: 3,
  background: "rgba(255,255,255,0.08)",
  borderRadius: 2,
  overflow: "hidden",
};

const S_PROGRESS_FILL_BASE: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #a78bfa, #c4b5fd)",
  borderRadius: 2,
  transition: "width 1s ease",
};

const S_REVENUE: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
};

const S_SEP: CSSProperties = {
  width: 1,
  height: 12,
  background: "rgba(255,255,255,0.08)",
};

const S_GOAL: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const S_LINK: CSSProperties = {
  fontSize: 11,
  color: "#a78bfa",
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

  return <span style={danger ? S_COUNTDOWN_DANGER : S_COUNTDOWN}>{formatCountdown(deathDate)}</span>;
});
CountdownTimer.displayName = "CountdownTimer";

// ── Component ──

export const ExperimentBar = memo(function ExperimentBar() {
  const [status, setStatus] = useState<ExperimentStatus>(FALLBACK);

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

  return (
    <div style={S_BAR}>
      {/* Day badge */}
      <span style={S_DAY}>Day {status.day_number}</span>

      <span style={S_SEP} />

      {/* Countdown — isolated component, re-renders at 1fps independently */}
      <CountdownTimer deathDate={status.death_date} danger={isDanger} />

      <span style={S_SEP} />

      {/* Revenue progress */}
      <div style={S_PROGRESS_WRAP}>
        <div style={S_PROGRESS_BAR}>
          <div style={progressFillStyle} />
        </div>
        <span style={S_REVENUE}>
          ${status.revenue?.monthly_usd || 0} / ${status.revenue?.target_monthly_usd || 36}
        </span>
      </div>

      <span style={S_SEP} />

      {/* Current goal (desktop only) */}
      <span style={S_GOAL} className="experiment-bar-goal">
        {status.current_goal}
      </span>

      {/* Mission link — hover via CSS class, avoids inline event handler allocation */}
      <a
        href="https://sngxai.com"
        target="_blank"
        rel="noopener noreferrer"
        className="experiment-bar-link"
        style={S_LINK}
      >
        Mission
      </a>
    </div>
  );
});

export default ExperimentBar;
