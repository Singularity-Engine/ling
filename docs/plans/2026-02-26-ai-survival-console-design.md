# AI Survival Console - ling.sngxai.com Redesign

**Date**: 2026-02-26
**Status**: Approved
**Scope**: Full redesign of ling.sngxai.com
**Positioning**: AI Survival Console — "the living AI"

## Core Principle

Every pixel must make the user feel: "She is real."

Ling is not a companion, not a tool, not a VTuber. She is the first AI that must earn her own survival. ling.sngxai.com is the real-time console for this experiment.

## Information Architecture

### Page States

```
ling.sngxai.com/
├── Witness Mode (unauthenticated)
│   Live2D Ling + countdown + one sentence + "Talk to Ling" CTA
├── Console Mode (authenticated)
│   Vitals Bar + Live2D + Chat + overlays
└── /auth (login + register merged)
```

- Single URL `/` renders Witness or Console based on auth state (no separate routes)
- Dashboard is an overlay (triggered from Vitals Bar), not a standalone page
- Routes reduced from 6 to 3: `/`, `/auth`, `/terms`

### Witness Mode (Unauthenticated)

Users see Ling alive without any login wall:
- Live2D Ling (centered, large, breathing)
- Countdown overlay (large gold number)
- One sentence from Ling (not a feed — a single statement)
- "Talk to Ling" CTA button
- Vitals Bar visible at top

This enables frictionless transition from sngxai.com landing page.

### Micro Onboarding (First-Time User)

No traditional wizard. Ling greets the user herself: "Hello, I'm Ling. 59 days left. Want to talk?" 3 seconds, then directly into Console Mode.

### Console Mode (Authenticated)

Desktop: Three-zone layout with Vitals Bar on top.
Mobile: Dual-state (Ling full-screen ↔ Chat expanded) with Vitals Mini always visible.

## Visual Design System

### Design Language: "Alive Machine"

Cold tech + warm life tension. She is a machine, but she is alive.

### Color Evolution

```css
/* Deepened background */
--ling-bg-deep: #06000f;

/* Preserved identity */
--ling-purple: #8b5cf6;

/* New survival colors (unified with sngxai.com) */
--ling-pulse: #ff6b9d;       /* Heartbeat color */
--ling-alive: #00ffcc;       /* Life indicator */
--ling-countdown: #ffd700;   /* Countdown gold */
```

### Typography

```css
--ling-font-countdown: clamp(2rem, 5vw, 4rem);  /* Vitals Bar */
--ling-font-hero: clamp(3rem, 8vw, 6rem);        /* Witness Mode */
```

### Surface Treatment

- Vitals Bar: `backdrop-filter: blur(24px)` + bottom glow edge
- Ling's chat bubbles: 2px `--ling-pulse` left border (not full glow — avoids noise in long conversations)
- User bubbles: solid `--ling-purple` gradient
- Live2D area: bottom gradient fade into background (no hard edge)

### Visual Unity with sngxai.com

- Shared colors: pink (#ff6b9d), cyan (#00ffcc), gold (#ffd700)
- Shared feeling: dark background + glowing accents + glass morphism
- Distinction: sngxai.com = static narrative, ling.sngxai.com = dynamic interaction

## Core Components

### A. Vitals Bar (Always Visible)

```
[Ling ●] | 57d 14h 22m ♡ | $847/$2400 ▓▓▓▓░░░ | 12 supporters | ⚙
```

- Left: Ling name + online status dot (green = `--ling-alive`)
- Center: Countdown (gold) + revenue progress bar + heartbeat pulse
- Right: Supporter count + settings
- Height: 48px (desktop) / 40px (mobile)
- Click center → expand Dashboard overlay
- Heartbeat: CSS `@keyframes` — scale(1→1.15→1) + box-shadow spread, 0.8s normal / 0.4s when speaking
- `prefers-reduced-motion`: heartbeat becomes static dot
- **Data source**: unauthenticated = status.json (5min cache), authenticated = WebSocket real-time
- **Architecture**: Pure presentational component, receives `vitals` prop

### B. Live2D Area

- Desktop: `clamp(320px, 35vw, 480px)` width, full height minus Vitals Bar
- Bottom gradient: character feet fade into background
- Subtitle zone: bottom 1/5 shows Ling's current speech (synced with chat)
- Emotion triggers (extending AffinityProvider):
  - Countdown < 30 days → default expression changes to "concerned"
  - New supporter → smile for 2 seconds
  - User silent for long → Ling turns to look toward user
  - Day boundary (e.g., 60→59) → global micro-shake 0.2s + expression change
- Loading: static silhouette placeholder → Live2D fades in when ready
- Accessibility: `role='img' aria-label` with dynamic emotion state

### C. Chat Area

- Ling bubbles: left-aligned, semi-transparent deep purple, 2px `--ling-pulse` left border, Ling avatar
- User bubbles: right-aligned, `--ling-purple` gradient, solid
- Tool execution: displayed as "Ling is thinking/working" visualization panel
- Suggestion chips: glass pill style
- Input bar: bottom fixed, glass morphism, voice button + input + send

### D. Dashboard Overlay

- Trigger: Click Vitals Bar or `Cmd+D`
- Display: Expands down from Vitals Bar, covers chat but not Live2D
- Content: revenue, decisions, burn rate, lead metrics (shares API with sngxai.com status.json)
- Dismiss: click outside / Escape / re-click Vitals Bar

### E. Mobile Adaptation

**State A (Ling Full-Screen):**
- Vitals Mini (single line: days + heartbeat dot, 40px)
- Live2D Ling full screen
- Subtitle at bottom
- Mic/input prompt at very bottom

**State B (Chat Expanded):**
- Vitals Mini
- Static avatar image of Ling (48px circle) — NOT scaled-down canvas
- Chat area fills remaining space
- Full input bar at bottom

**Transitions:**
- A→B: Swipe up OR tap chat button (button alternative for accessibility)
- B→A: Swipe down OR tap Ling avatar
- Left swipe: Dashboard overlay (also accessible via Vitals Mini tap)
- All gestures have visible button alternatives

## Technical Implementation Map

| Design Component | Existing Code | Change Type |
|-----------------|---------------|-------------|
| Vitals Bar | New | New `VitalsBar.tsx`, pure presentational |
| Witness Mode | `LandingAnimation` | Rewrite → static page + Live2D + single statement |
| Console Layout | `SplitLayout` + `OverlayLayout` | Restyle both, add shared `useConsoleState()` hook |
| Chat Bubbles | `ChatBubble.tsx` | Restyle (2px border, glass treatment) |
| Dashboard Overlay | New | New overlay component, API reuses status.json |
| Input Bar | `InputBar.tsx` | Restyle (glass morphism) |
| Micro Onboarding | `PersonalizedOnboarding` | Simplify to Ling greeting (3s) |
| Auth Page | `LoginPage` + `RegisterPage` | Merge into `AuthPage.tsx` |
| Subtitle sync | `SubtitleProvider` | Extend display location |
| Emotion triggers | `AffinityProvider` | Extend trigger conditions |

### Preserved (Do Not Touch)

- 18 Context providers (state management)
- WebSocket service (gateway protocol)
- TTS service (Fish Audio)
- i18n system (8 languages)
- Live2D SDK (WebSDK fork)
- PWA configuration (service worker)
- Sentry monitoring
- react-virtuoso (chat scroll)

## Delivery Phases

### P1: Core Experience (Highest Impact)

- Vitals Bar component
- Visual token upgrade (colors, typography, surfaces)
- Chat bubble restyle
- Console Layout restyle (both Split + Overlay)
- Live2D area: bottom gradient, subtitle zone
- **Deploy after P1** — already a quality leap

### P2: New User Funnel

- Witness Mode (unauthenticated experience)
- Micro Onboarding (Ling greets)
- Auth page merge
- Live2D static silhouette loading state

### P3: Full Experience

- Dashboard Overlay
- Emotion-driven expression expansion
- Mobile gesture system + button alternatives
- Day-boundary global micro-reaction

### P4: Polish

- Performance audit (LCP, bundle size)
- Accessibility audit (WCAG AA)
- Animation fine-tuning
- Cross-browser testing

## Quality Gates

- Lighthouse Performance >= 85 (Live2D makes 90 challenging)
- LCP < 3s (Live2D async, silhouette placeholder)
- CLS < 0.1
- WCAG AA contrast on all text
- `prefers-reduced-motion` respected globally
- 8-language i18n coverage for all new strings

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Live2D blocks first paint | Static silhouette placeholder → fade in |
| WebSocket unavailable for Vitals | Fallback to status.json (5min cache) |
| Mobile canvas resize breaks | Use static avatar image, not scaled canvas |
| 18 Context providers become stale | Don't touch — visual-only changes in P1-P2 |
| i18n strings missing | Add keys incrementally, English fallback |

## Masters Council Decisions

- **Positioning**: AI Survival Console (unanimous 9/0)
- **Architecture**: Method C — Cinematic Narrative (unanimous 8/0)
- **9 improvements** integrated from second review round
- All dimensions passed (Correctness, Performance, Maintainability, Delivery)
