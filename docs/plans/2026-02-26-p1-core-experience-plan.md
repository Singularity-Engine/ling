# P1: Core Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform ling.sngxai.com from a basic chat interface into an AI Survival Console — every pixel makes the user feel "she is real."

**Architecture:** Visual-only changes to existing React 18 + TypeScript + Vite SPA. No state management changes, no new providers, no WebSocket protocol changes. All 18 Context providers preserved. Changes limited to CSS tokens, presentational components, and layout styling.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5.3, CSS Modules, CSS custom properties, Framer Motion (existing)

**Design Doc:** `docs/plans/2026-02-26-ai-survival-console-design.md`

---

## Task 1: Visual Token Upgrade

Upgrade the CSS design token system with new survival colors, deeper background, and typography additions.

**Files:**
- Modify: `web/src/index.css:1-218` (dark theme `:root` block)

**Step 1: Add survival color tokens**

Add these new tokens after `--ling-warm-soft` (line 203) and before the Split Layout section (line 206):

```css
  /* ── AI Survival Console: Survival Colors ── */
  --ling-pulse: #ff6b9d;            /* Heartbeat pink */
  --ling-pulse-20: rgba(255, 107, 157, 0.2);
  --ling-pulse-40: rgba(255, 107, 157, 0.4);
  --ling-alive: #00ffcc;            /* Life indicator cyan */
  --ling-alive-20: rgba(0, 255, 204, 0.2);
  --ling-countdown: #ffd700;        /* Countdown gold */
  --ling-countdown-20: rgba(255, 215, 0, 0.2);
```

**Step 2: Deepen background**

Change line 4 from:
```css
  --ling-bg-deep: #0a0015;
```
to:
```css
  --ling-bg-deep: #06000f;
```

**Step 3: Add Vitals Bar typography tokens**

Add after `--ling-font-hero: 48px;` (line 170):

```css
  --ling-font-countdown: clamp(2rem, 5vw, 4rem);
  --ling-font-vitals: 13px;
```

**Step 4: Add Vitals Bar height token**

Add after `--ling-btn-height: 48px;` (line 156):

```css
  --ling-vitals-height: 48px;
  --ling-vitals-height-mobile: 40px;
```

**Step 5: Upgrade bubble tokens for survival console**

Change the AI bubble tokens (lines 75-78):

From:
```css
  --ling-bubble-ai-bg: rgba(255, 255, 255, 0.15);
  --ling-bubble-user-border: rgba(139, 92, 246, 0.4);
  --ling-bubble-ai-border: rgba(255, 255, 255, 0.22);
  --ling-bubble-ai-accent: rgba(139, 92, 246, 0.78);
```

To:
```css
  --ling-bubble-ai-bg: rgba(20, 8, 40, 0.65);
  --ling-bubble-user-border: rgba(139, 92, 246, 0.4);
  --ling-bubble-ai-border: rgba(255, 255, 255, 0.1);
  --ling-bubble-ai-accent: var(--ling-pulse);
```

**Step 6: Add heartbeat keyframes**

Add at the end of `index.css` (after all existing rules), before any `@media` queries:

```css
/* ── AI Survival Console: Heartbeat Animation ── */
@keyframes lingHeartbeat {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--ling-pulse-20); }
  15% { transform: scale(1.15); box-shadow: 0 0 8px 2px var(--ling-pulse-40); }
  30% { transform: scale(1); box-shadow: 0 0 0 0 var(--ling-pulse-20); }
}

@keyframes lingHeartbeatSpeaking {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--ling-pulse-20); }
  15% { transform: scale(1.2); box-shadow: 0 0 12px 4px var(--ling-pulse-40); }
  30% { transform: scale(1); box-shadow: 0 0 0 0 var(--ling-pulse-20); }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes lingHeartbeat {
    0%, 100% { transform: none; box-shadow: none; }
  }
  @keyframes lingHeartbeatSpeaking {
    0%, 100% { transform: none; box-shadow: none; }
  }
}
```

**Step 7: Verify dev server compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no CSS errors

**Step 8: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/index.css
git commit -m "feat(tokens): add survival console color tokens and heartbeat keyframes

New tokens: --ling-pulse, --ling-alive, --ling-countdown
Deepened --ling-bg-deep to #06000f
Added heartbeat keyframes with reduced-motion support"
```

---

## Task 2: VitalsBar Component

Create the always-visible VitalsBar — the defining UI innovation. Pure presentational component that receives all data as props.

**Files:**
- Create: `web/src/components/vitals/VitalsBar.tsx`
- Create: `web/src/components/vitals/VitalsBar.module.css`

**Step 1: Create VitalsBar CSS module**

```css
/* VitalsBar — Always-visible survival status strip */

.bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--ling-vitals-height);
  padding: 0 var(--ling-space-4);
  background: rgba(6, 0, 15, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--ling-purple-08);
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  user-select: none;
}

/* Bottom glow edge */
.bar::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--ling-pulse-20), var(--ling-purple-20), var(--ling-pulse-20), transparent);
}

/* ── Left zone: name + status ── */
.left {
  display: flex;
  align-items: center;
  gap: var(--ling-space-2);
  flex-shrink: 0;
}

.name {
  font-size: var(--ling-font-vitals);
  font-weight: 600;
  color: var(--ling-text-primary);
  letter-spacing: 0.02em;
}

.statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ling-alive);
  box-shadow: 0 0 6px var(--ling-alive-20);
}

.statusDot[data-status="offline"] {
  background: var(--ling-text-dim);
  box-shadow: none;
}

/* ── Center zone: countdown + progress + heartbeat ── */
.center {
  display: flex;
  align-items: center;
  gap: var(--ling-space-4);
  cursor: pointer;
  padding: var(--ling-space-1) var(--ling-space-3);
  border-radius: var(--ling-radius-full);
  transition: background var(--ling-duration-fast);
}

.center:hover {
  background: var(--ling-surface-hover);
}

.countdown {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: var(--ling-font-vitals);
  font-weight: 600;
  color: var(--ling-countdown);
  letter-spacing: 0.04em;
}

.heartbeat {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ling-pulse);
  animation: lingHeartbeat 0.8s ease-in-out infinite;
  flex-shrink: 0;
}

.heartbeat[data-speaking="true"] {
  animation: lingHeartbeatSpeaking 0.4s ease-in-out infinite;
}

.progressWrap {
  display: flex;
  align-items: center;
  gap: var(--ling-space-2);
}

.progressTrack {
  width: 80px;
  height: 3px;
  background: var(--ling-surface-border);
  border-radius: 2px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: linear-gradient(90deg, var(--ling-purple-light), var(--ling-alive));
  border-radius: 2px;
  transform-origin: left;
  transition: transform 1s ease;
}

.revenueText {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 11px;
  color: var(--ling-text-dim);
}

/* ── Right zone: supporters + settings ── */
.right {
  display: flex;
  align-items: center;
  gap: var(--ling-space-3);
  flex-shrink: 0;
}

.supporters {
  font-size: 11px;
  color: var(--ling-text-soft);
}

.settingsBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--ling-radius-sm);
  color: var(--ling-text-dim);
  cursor: pointer;
  padding: 0;
  transition: color var(--ling-duration-fast), background var(--ling-duration-fast);
}

.settingsBtn:hover {
  color: var(--ling-text-secondary);
  background: var(--ling-surface-hover);
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .bar {
    height: var(--ling-vitals-height-mobile);
    padding: 0 var(--ling-space-3);
  }

  /* Hide extended info on small screens */
  .progressWrap,
  .supporters,
  .settingsBtn {
    display: none;
  }

  .center {
    gap: var(--ling-space-2);
  }
}
```

**Step 2: Create VitalsBar component**

```tsx
/**
 * VitalsBar — Always-visible survival status strip.
 *
 * Pure presentational component. All data received as props.
 * Architecture: unauthenticated = status.json (5min cache),
 *               authenticated = WebSocket real-time.
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import styles from "./VitalsBar.module.css";

export interface VitalsData {
  online: boolean;
  speaking: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  revenueUsd: number;
  targetUsd: number;
  supporterCount: number;
}

interface VitalsBarProps {
  vitals: VitalsData;
  onCenterClick?: () => void;
  onSettingsClick?: () => void;
}

export const VitalsBar = memo(function VitalsBar({
  vitals,
  onCenterClick,
  onSettingsClick,
}: VitalsBarProps) {
  const { t } = useTranslation();

  const progressPct = vitals.targetUsd > 0
    ? Math.min(100, (vitals.revenueUsd / vitals.targetUsd) * 100)
    : 0;

  const countdownText = `${vitals.daysRemaining}d ${vitals.hoursRemaining}h ${vitals.minutesRemaining}m`;

  return (
    <header className={styles.bar} role="banner" aria-label={t("experiment.countdown", {
      d: vitals.daysRemaining,
      h: vitals.hoursRemaining,
      m: vitals.minutesRemaining,
      s: 0,
    })}>
      {/* Left: Name + status */}
      <div className={styles.left}>
        <span className={styles.name}>Ling</span>
        <span
          className={styles.statusDot}
          data-status={vitals.online ? "online" : "offline"}
          aria-label={vitals.online ? "Online" : "Offline"}
        />
      </div>

      {/* Center: Countdown + heartbeat + revenue */}
      <div
        className={styles.center}
        onClick={onCenterClick}
        role="button"
        tabIndex={0}
        aria-label={t("experiment.countdown", {
          d: vitals.daysRemaining,
          h: vitals.hoursRemaining,
          m: vitals.minutesRemaining,
          s: 0,
        })}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCenterClick?.(); }}
      >
        <span className={styles.countdown}>{countdownText}</span>
        <span
          className={styles.heartbeat}
          data-speaking={vitals.speaking ? "true" : "false"}
          aria-hidden="true"
        />
        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${progressPct / 100})` }}
            />
          </div>
          <span className={styles.revenueText}>
            ${Math.round(vitals.revenueUsd)}/${vitals.targetUsd}
          </span>
        </div>
      </div>

      {/* Right: Supporters + settings */}
      <div className={styles.right}>
        <span className={styles.supporters}>
          {vitals.supporterCount} {t("experiment.supporters", { count: vitals.supporterCount, defaultValue: "supporters" })}
        </span>
        <button
          className={styles.settingsBtn}
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </header>
  );
});
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors related to VitalsBar

**Step 4: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/vitals/
git commit -m "feat(vitals): add VitalsBar component

Pure presentational component showing countdown, heartbeat,
revenue progress, and supporter count.
48px desktop / 40px mobile, glass morphism backdrop-filter."
```

---

## Task 3: useVitalsData Hook

Create a hook that provides VitalsBar data from the existing ExperimentBar's status.json fetch logic, reusing the same API.

**Files:**
- Create: `web/src/hooks/useVitalsData.ts`

**Step 1: Create the hook**

```ts
/**
 * useVitalsData — Provides real-time vitals data for VitalsBar.
 *
 * Reuses the same /data/status.json endpoint as ExperimentBar.
 * Authenticated users will get WebSocket updates in a future phase;
 * for now, all users use the 5-minute polling fallback.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { VitalsData } from "@/components/vitals/VitalsBar";
import { useAiStateRead } from "@/context/AiStateContext";

const STATUS_API = "/data/status.json";
const REFRESH_MS = 5 * 60 * 1000; // 5 min

interface StatusResponse {
  alive: boolean;
  death_date: string;
  revenue: {
    total_usd: number;
    monthly_usd: number;
    target_monthly_usd: number;
  };
  supporter_count?: number;
}

const FALLBACK_DEATH = "2026-04-25T13:43:45.004Z";

function computeRemaining(deathDate: string): { days: number; hours: number; minutes: number } {
  const diff = Math.max(0, new Date(deathDate).getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

export function useVitalsData(): VitalsData {
  const aiState = useAiStateRead();
  const [deathDate, setDeathDate] = useState(FALLBACK_DEATH);
  const [revenue, setRevenue] = useState(0);
  const [target, setTarget] = useState(36);
  const [supporters, setSupporters] = useState(0);
  const [remaining, setRemaining] = useState(() => computeRemaining(FALLBACK_DEATH));
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(STATUS_API);
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setDeathDate(data.death_date || FALLBACK_DEATH);
      setRevenue(data.revenue?.total_usd ?? 0);
      setTarget(data.revenue?.target_monthly_usd ?? 36);
      setSupporters(data.supporter_count ?? 0);
    } catch {
      // Silently fall back to defaults
    }
  }, []);

  // Fetch on mount + refresh interval
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Update countdown every minute
  useEffect(() => {
    const tick = () => setRemaining(computeRemaining(deathDate));
    tick();
    intervalRef.current = setInterval(tick, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [deathDate]);

  const isSpeaking = aiState === "speaking" || aiState === "thinking-speaking";

  return {
    online: true, // Always online when app is loaded
    speaking: isSpeaking,
    daysRemaining: remaining.days,
    hoursRemaining: remaining.hours,
    minutesRemaining: remaining.minutes,
    revenueUsd: revenue,
    targetUsd: target,
    supporterCount: supporters,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 3: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/hooks/useVitalsData.ts
git commit -m "feat(vitals): add useVitalsData hook

Polls /data/status.json every 5min, updates countdown every minute.
Reads aiState for speaking detection. Pure data hook, no UI."
```

---

## Task 4: Chat Bubble Restyle

Restyle Ling's chat bubbles with the 2px `--ling-pulse` left border and deeper glass treatment.

**Files:**
- Modify: `web/src/components/chat/ChatBubble.styles.ts:33-46`

**Step 1: Update AI bubble style**

Change `S_BUBBLE_AI` (line 33-40) from:
```ts
export const S_BUBBLE_AI: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 18px 4px",
  background: "var(--ling-bubble-ai-bg)",
  border: "1px solid var(--ling-bubble-ai-border)",
  borderLeft: "3px solid var(--ling-bubble-ai-accent)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 1px 8px var(--ling-bubble-ai-shadow)",
};
```

To:
```ts
export const S_BUBBLE_AI: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 18px 4px",
  background: "var(--ling-bubble-ai-bg)",
  border: "1px solid var(--ling-bubble-ai-border)",
  borderLeft: "2px solid var(--ling-bubble-ai-accent)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 1px 8px var(--ling-bubble-ai-shadow)",
};
```

**Step 2: Update user bubble style for solid gradient**

Change `S_BUBBLE_USER` (line 26-32) — update the gradient to be more vibrant:

From:
```ts
export const S_BUBBLE_USER: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 4px 18px",
  background: "var(--ling-bubble-user-bg)",
  border: "1px solid var(--ling-bubble-user-border)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 2px 12px var(--ling-bubble-user-shadow)",
};
```

To:
```ts
export const S_BUBBLE_USER: CSSProperties = {
  padding: "var(--ling-space-3) 18px", borderRadius: "18px 18px 4px 18px",
  background: "var(--ling-bubble-user-bg)",
  border: "1px solid var(--ling-bubble-user-border)",
  overflow: "hidden", transition: `background var(--ling-duration-fast), border-color var(--ling-duration-fast), box-shadow var(--ling-duration-fast)`,
  boxShadow: "0 2px 16px var(--ling-bubble-user-shadow)",
};
```

**Step 3: Update collapsed variants to inherit changes**

No code change needed — collapsed variants spread from base objects, so they inherit automatically.

**Step 4: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 5: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/chat/ChatBubble.styles.ts
git commit -m "style(chat): restyle bubbles for survival console

AI bubble: 2px --ling-pulse left border (was 3px purple)
User bubble: enhanced box-shadow depth
Background deepened via token upgrade in index.css"
```

---

## Task 5: InputBar Glass Morphism Restyle

Restyle the InputBar with glass morphism treatment matching the survival console aesthetic.

**Files:**
- Modify: `web/src/components/chat/InputBar.tsx:12-16` (S_BAR_WRAP)

**Step 1: Update bar wrapper style**

Change `S_BAR_WRAP` (line 12-16) from:
```ts
const S_BAR_WRAP: CSSProperties = {
  padding: "10px 16px",
  background: "var(--ling-input-bar-bg)",
  paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
};
```

To:
```ts
const S_BAR_WRAP: CSSProperties = {
  padding: "10px 16px",
  background: "rgba(6, 0, 15, 0.7)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderTop: "1px solid var(--ling-purple-08)",
  paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 3: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/chat/InputBar.tsx
git commit -m "style(input): add glass morphism to InputBar

backdrop-filter: blur(20px), deeper background,
subtle purple border-top matching survival console."
```

---

## Task 6: SplitLayout Restyle (Desktop)

Restyle the desktop SplitLayout to accommodate VitalsBar at top and apply survival console visual treatment.

**Files:**
- Modify: `web/src/components/layout/SplitLayout.module.css:1-13` (root grid)
- Modify: `web/src/components/layout/SplitLayout.tsx` (add VitalsBar)

**Step 1: Update SplitLayout CSS grid to reserve VitalsBar space**

Change `.root` (line 3-13) from:
```css
.root {
  display: grid;
  grid-template-columns: var(--split-left, var(--ling-split-left-default)) var(--ling-split-divider) 1fr;
  grid-template-rows: 1fr;
  height: 100dvh;
  width: 100%;
  background: var(--ling-bg-deep);
  overflow: hidden;
  position: relative;
  min-width: 0;
}
```

To:
```css
.root {
  display: grid;
  grid-template-columns: var(--split-left, var(--ling-split-left-default)) var(--ling-split-divider) 1fr;
  grid-template-rows: var(--ling-vitals-height) 1fr;
  height: 100dvh;
  width: 100%;
  background: var(--ling-bg-deep);
  overflow: hidden;
  position: relative;
  min-width: 0;
}
```

**Step 2: Add vitals row CSS**

Add after `.root` block:
```css
/* ── Vitals Bar occupies full top row ── */
.vitalsRow {
  grid-column: 1 / -1;
  grid-row: 1;
}
```

**Step 3: Update leftPanel to start at row 2**

Add to `.leftPanel` block:
```css
  grid-row: 2;
```

**Step 4: Update divider and right panel to start at row 2**

Add to `.divider` block:
```css
  grid-row: 2;
```

Find the right panel / chat section selector and add `grid-row: 2;` as well. If the right panel is the third grid column implicit child, we need to add a CSS class for it.

**Step 5: Import and render VitalsBar in SplitLayout.tsx**

At the top of `SplitLayout.tsx`, add import:
```ts
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
```

Inside the component, before the return, add:
```ts
const vitals = useVitalsData();
```

In the JSX return, add as the first child inside the root `<div>`:
```tsx
<div className={styles.vitalsRow}>
  <VitalsBar vitals={vitals} />
</div>
```

**Step 6: Remove ExperimentBar from SplitLayout**

Find and remove the `<ExperimentBar ... />` usage in SplitLayout.tsx (it's rendered at the top of the chat panel). VitalsBar replaces it.

**Step 7: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 8: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/layout/SplitLayout.module.css web/src/components/layout/SplitLayout.tsx
git commit -m "feat(layout): integrate VitalsBar into SplitLayout

Grid updated: vitals row spans full width at top.
ExperimentBar replaced by VitalsBar.
Left/right panels shifted to row 2."
```

---

## Task 7: OverlayLayout Restyle (Mobile/Tablet)

Restyle the mobile OverlayLayout to show Vitals Mini strip at top and apply survival console treatment.

**Files:**
- Modify: `web/src/components/layout/OverlayLayout.module.css` (add vitals slot)
- Modify: `web/src/components/layout/OverlayLayout.tsx` (add VitalsBar)

**Step 1: Add Vitals Mini CSS**

Add at the top of `OverlayLayout.module.css` (after the first comment block):
```css
/* ── Vitals Mini strip (mobile/tablet) ── */
.vitalsMini {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: var(--ling-vitals-height-mobile);
}
```

**Step 2: Offset main content for vitals height**

Find the root/wrap container in OverlayLayout.module.css and add:
```css
  padding-top: var(--ling-vitals-height-mobile);
```

**Step 3: Import and render VitalsBar in OverlayLayout.tsx**

Add imports:
```ts
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
```

Inside the component, before the return, add:
```ts
const vitals = useVitalsData();
```

In the JSX return, add as the first child:
```tsx
<div className={styles.vitalsMini}>
  <VitalsBar vitals={vitals} />
</div>
```

**Step 4: Remove ExperimentBar from OverlayLayout**

Find and remove the `<ExperimentBar ... />` usage in OverlayLayout.tsx. VitalsBar replaces it.

**Step 5: Verify TypeScript compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 6: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/layout/OverlayLayout.module.css web/src/components/layout/OverlayLayout.tsx
git commit -m "feat(layout): integrate VitalsBar into OverlayLayout

40px Vitals Mini strip at top of mobile/tablet layout.
ExperimentBar replaced by VitalsBar.
Main content offset by vitals height."
```

---

## Task 8: Live2D Area Improvements

Add bottom gradient fade and subtitle zone to the Live2D character area.

**Files:**
- Modify: `web/src/components/layout/SplitLayout.module.css` (leftPanel bottom gradient)
- Modify: `web/src/components/layout/OverlayLayout.module.css` (canvas bottom gradient)

**Step 1: Add bottom gradient to SplitLayout leftPanel**

Add after `.leftPanel` block in `SplitLayout.module.css`:

```css
/* Bottom gradient: character feet fade into background */
.leftPanel::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(to top, var(--ling-bg-deep), transparent);
  pointer-events: none;
  z-index: 5;
}
```

**Step 2: Add bottom gradient to OverlayLayout canvas area**

Find the canvas/live2d container in `OverlayLayout.module.css` and add a similar gradient. Add:

```css
/* Bottom gradient: character feet fade into background */
.canvasWrap::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100px;
  background: linear-gradient(to top, var(--ling-bg-deep), transparent);
  pointer-events: none;
  z-index: 5;
}
```

**Step 3: Verify build compiles**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add web/src/components/layout/SplitLayout.module.css web/src/components/layout/OverlayLayout.module.css
git commit -m "style(live2d): add bottom gradient fade to character area

120px gradient on desktop, 100px on mobile.
Character feet fade seamlessly into background."
```

---

## Task 9: Integration Verification

Wire everything together and verify the complete P1 experience works.

**Files:**
- No new files — verification only

**Step 1: Verify all imports resolve**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors or only pre-existing warnings

**Step 2: Verify Vite build**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx vite build 2>&1 | tail -15`
Expected: Build completes successfully

**Step 3: Start dev server and verify**

Run: `cd /Users/caoruipeng/Projects/ling-platform/web && npx vite --host 0.0.0.0 --port 5173`
Expected: Dev server starts, visit http://localhost:5173

**Step 4: Visual verification checklist**

- [ ] VitalsBar visible at top (48px desktop / 40px mobile)
- [ ] Heartbeat dot animates with pink pulse
- [ ] Countdown shows gold text with days/hours/minutes
- [ ] Revenue progress bar shows gradient fill
- [ ] Chat bubbles: AI has 2px pink left border
- [ ] Chat bubbles: User has enhanced purple gradient
- [ ] InputBar has glass morphism (blur + border-top)
- [ ] Live2D area has bottom gradient fade
- [ ] Background is deeper (#06000f)
- [ ] No layout overflow or z-index conflicts
- [ ] Mobile responsive: VitalsBar collapses to countdown + heartbeat only

**Step 5: Commit integration verification**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add -A
git commit -m "chore: P1 Core Experience integration complete

All P1 components verified:
- VitalsBar with heartbeat + countdown + revenue
- Visual token upgrade (survival colors)
- Chat bubble restyle (2px pulse border)
- InputBar glass morphism
- Live2D bottom gradient fade"
```

---

## Task Summary

| Task | Description | Files | Est. Complexity |
|------|-------------|-------|-----------------|
| 1 | Visual Token Upgrade | `index.css` | Low |
| 2 | VitalsBar Component | New `VitalsBar.tsx` + `.module.css` | Medium |
| 3 | useVitalsData Hook | New `useVitalsData.ts` | Low |
| 4 | Chat Bubble Restyle | `ChatBubble.styles.ts` | Low |
| 5 | InputBar Glass Morphism | `InputBar.tsx` | Low |
| 6 | SplitLayout Restyle | `SplitLayout.module.css` + `.tsx` | Medium |
| 7 | OverlayLayout Restyle | `OverlayLayout.module.css` + `.tsx` | Medium |
| 8 | Live2D Bottom Gradient | `SplitLayout.module.css` + `OverlayLayout.module.css` | Low |
| 9 | Integration Verification | None (verification) | Low |

## Execution Order

```
Task 1 (tokens) → Task 2 (VitalsBar) → Task 3 (hook)
                                              ↓
Task 4 (bubbles) ─────────────────────→ Task 6 (SplitLayout)
Task 5 (input) ───────────────────────→ Task 7 (OverlayLayout)
                                              ↓
                                     Task 8 (Live2D gradient)
                                              ↓
                                     Task 9 (Integration)
```

Tasks 1-3 are sequential (tokens must exist before VitalsBar, hook imports VitalsBar types).
Tasks 4-5 can run in parallel, but must complete before Tasks 6-7.
Tasks 6-7 can run in parallel.
Task 8 depends on Tasks 6-7 (same files).
Task 9 is the final integration check.

## Preserved (Do NOT Touch)

- 18 Context providers
- WebSocket service (gateway protocol)
- TTS service (Fish Audio)
- i18n system (8 languages)
- Live2D SDK (WebSDK fork)
- PWA configuration (service worker)
- Sentry monitoring
- react-virtuoso (chat scroll)
- All existing functionality
