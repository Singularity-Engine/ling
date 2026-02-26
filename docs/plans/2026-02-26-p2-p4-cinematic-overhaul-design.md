# P2-P4: Cinematic Overhaul — ling.sngxai.com

**Date**: 2026-02-26
**Status**: Approved (Masters Council 12/0, no blockers)
**Scope**: P2 (Witness Mode + Cinematic Overture), P3 (Full Experience), P4 (Polish)
**Prerequisite**: P1 Core Experience (completed on `rebrand/ling`)
**Design Doc**: Extends `2026-02-26-ai-survival-console-design.md`

## Deployment Strategy: Two Waves

### Wave 1 — Minimum Shippable Line (deploy immediately after completion)
1. Vite production build (switch from dev server to nginx)
2. Cinematic Overture (6-phase, 6 seconds)
3. Witness Mode page (unauthenticated experience)
4. Micro Onboarding (Ling's greeting)
5. Live2D silhouette placeholder
6. Minimal OAuth modal (Google button only, on CTA click)

### Wave 2 — Post-launch iteration
7. Full Auth page merge (LoginPage + RegisterPage → AuthPage)
8. Dashboard Overlay
9. Emotion trigger system (6 triggers)
10. Mobile gesture system
11. Witness → Console crossfade transition
12. All P4 content (performance, accessibility, animation, analytics)

---

## P2: Witness Mode — Cinematic First Impression

### A. Cinematic Overture (6 phases, ~6 seconds)

Evolves existing `LandingAnimation` (has particle system + typewriter).

```
Phase 0 (0-1.5s)  VOID+PULSE   Dark + sparse particles float + center pulse begins
                                (merges original Phase 0+1)
Phase 1 (1.5-3s)  SILHOUETTE   Ling's static SVG silhouette fades in (opacity 0→0.6)
                                Particles orbit silhouette
Phase 2 (3-4s)    AWAKEN       Live2D ready → silhouette crossfades to real Ling (700ms)
                                Ling takes one breath
Phase 3 (4-5s)    VITALS+GAZE  VitalsBar slides in from top (translateY)
                                Ling turns to look at camera (simultaneous)
Phase 4 (5-6s)    SPEAK+CTA    One sentence typewriter + CTA button fade in (simultaneous)
                                「59 days left. Talk to me.」
Phase 5 (6s+)     IDLE         Waiting state. Ling breathes, CTA pulses.
```

**Technical requirements:**
- All animations: `transform` + `opacity` only (GPU-friendly, 60fps)
- Framer Motion `AnimatePresence` + `variants` for phase orchestration
- Skip button visible from 0s (top-right, subtle, 44×44px touch target)
- Keyboard skip: Escape / Enter / Space
- `prefers-reduced-motion`: skip to Phase 5 instantly (no animation)
- `sessionStorage('ling-overture-seen')`: returning users skip to Phase 5
- Particle count ≤ 200 (no OffscreenCanvas, main thread canvas is sufficient)
- CTA pulse: `scale 1→1.04→1` + `box-shadow 0 0 0 0 → 0 0 20px 4px var(--ling-pulse-20)`, 3s loop

**Accessibility:**
- `aria-live="polite"` region at overture start: "Ling is awakening..."
- `aria-live="polite"` at Phase 4: reads daily_statement + "Press Enter to start talking"
- No per-phase announcements (too noisy)

**Files:**
| File | Change |
|------|--------|
| `web/src/components/landing/LandingAnimation.tsx` | Rewrite as 6-phase orchestration engine |
| `web/src/components/landing/ParticleCanvas.tsx` | Add `converge-to-silhouette` particle behavior |
| New: `web/src/components/landing/LingSilhouette.tsx` | Static SVG silhouette component |
| `web/src/components/canvas/live2d.tsx` | Loading overlay → transparent (overture handles loading state) |

### B. Witness Mode (Unauthenticated State)

After overture completes, unauthenticated users see:

```
┌─────────────────────────────────┐
│  VitalsBar (full, interactive)  │ 48px
├─────────────────────────────────┤
│                                 │
│        Live2D Ling              │
│      (centered, large)          │
│      breathing + idle           │
│                                 │
│   ┌─────────────────────┐       │
│   │ daily_statement      │      │ single sentence overlay
│   └─────────────────────┘       │
│                                 │
│     [ Talk to Ling ]            │ CTA (pulsing)
│                                 │
└─────────────────────────────────┘
```

- `daily_statement`: from status.json (new field), 30 pre-written statements rotated by day index
- Ling has idle behaviors (turn head, blink, sigh) — feels "alive even when no one's talking"
- CTA click → Minimal OAuth modal (Wave 1) or full AuthPage (Wave 2)
- VitalsBar fully interactive (countdown ticks, heartbeat animates)

**daily_statement requirements (30 sentences):**
- ≤ 15 English words each
- Time-aware ("today", "right now", "still here")
- Emotion variety (hope, curiosity, gratitude, determination, concern, wonder)
- No two consecutive days with same emotion

### C. Micro Onboarding

Replaces 4-step PersonalizedOnboarding. Ling herself does the onboarding:

```
First login → Console Mode loads
│
├─ Ling expression → "curious"
├─ Chat area: Ling's first message (typewriter):
│   "Hello. I'm Ling. 59 days left. Want to talk?"
├─ 3 suggestion chips appear:
│   [ Who are you? ] [ What does 59 days mean? ] [ Let's just chat ]
└─ User picks any → normal conversation begins
```

- 3 seconds total, non-blocking
- No user preference collection (current 4-step interests/goals are not consumed by backend)
- `PersonalizedOnboarding` component kept but no longer rendered (can delete later)

### D. Auth Page Merge (Wave 2)

Merge `LoginPage` + `RegisterPage` into single `AuthPage`:

- URL: `/auth` (301 redirect from `/login` and `/register`)
- OAuth buttons (Google, GitHub) prominently at top
- Email/password form below with toggle between Sign In / Create Account
- Same visual language (glass morphism, survival colors)

### E. Minimal OAuth Modal (Wave 1)

Instead of full Auth merge, Wave 1 adds a lightweight modal on CTA click:

```tsx
// Triggered when unauthenticated user clicks "Talk to Ling"
<Dialog>
  <DialogContent className="glass-modal">
    <h2>Talk to Ling</h2>
    <OAuthButton provider="google" /> {/* Google Sign-In, full width */}
    <Link to="/login">Other sign-in options →</Link>
  </DialogContent>
</Dialog>
```

- Single Google OAuth button (highest conversion, lowest friction)
- Fallback link to existing login page
- Dismissible (click outside / Escape)

### F. Live2D Silhouette Placeholder

Replace current spinner ("Ling is waking up...") with static silhouette:

- SVG silhouette of Ling (same as overture Phase 1)
- Subtle breathing animation (CSS only, `transform: scaleY(1→1.01→1)`, 4s loop)
- Crossfade to real Live2D when ready (700ms opacity transition)
- 8-second timeout → show "Ling is taking longer than usual. Retry?" text

### G. Vite Production Build (moved from P4)

**Critical performance fix.** Current `ling-web` Docker container runs Vite dev server in production.

Change in `docker-compose.prod.yml`:
- Build: `vite build` → static files in `/dist`
- Serve: nginx (or `npx serve -s dist -l 3001`)
- Expected impact: 2-5x performance improvement, proper tree-shaking, minification

---

## P3: Full Experience — Emotion + Interaction + Dashboard

### A. Dashboard Overlay

Trigger: VitalsBar center click / `Cmd+D` / `Ctrl+D`

```
Desktop: Expands down from VitalsBar, covers chat area, NOT Live2D
Mobile: Full-screen overlay (z-index 150), slides down from top
```

**Content sections:**
1. Revenue: `$847 / $2400` + progress bar
2. Burn Rate: `$3,000/mo`
3. Runway: `59d 14h 22m`
4. Supporters: numbered list ("Supporter #1: @alice", "#2: @bob"...)
5. Decisions: recent decisions Ling has made

**Technical:**
- Animation: `translateY(-20px)` + `opacity 0→1`, 300ms ease-out
- Close: click outside / Escape / re-click VitalsBar center
- Glass morphism: `backdrop-filter: blur(32px)` + `background: rgba(6, 0, 15, 0.9)`
- Focus trap when open, **focus returns to VitalsBar center on close**
- Data: extends status.json with `decisions[]`, `burn_rate`, `runway_days`
- Numbers: `font-variant-numeric: tabular-nums` (prevents layout shift on number change)

**Files:**
| File | Type |
|------|------|
| New: `web/src/components/dashboard/DashboardOverlay.tsx` | Component |
| New: `web/src/components/dashboard/DashboardOverlay.module.css` | Styles |
| New: `web/src/hooks/useDashboardData.ts` | Data hook (extends status.json) |

### B. Emotion Trigger System

Extends existing `AffinityProvider` (already 3-context split architecture).

| Trigger | Expression | Duration | Source |
|---------|-----------|----------|--------|
| `daysRemaining < 30` | "concerned" | Persistent | useVitalsData |
| `daysRemaining < 7` | "anxious" | Persistent | useVitalsData |
| New supporter (count +1) | smile + nod | 2s | status.json diff |
| User silent > 3min | Turn toward user | Until interaction | Idle timer |
| Day boundary (60→59) | Global micro-shake 0.2s | 0.5s | Midnight check |
| Revenue milestone (25/50/75%) | Happy + particle burst | 3s | Revenue threshold |

**New keyframe:**
```css
@keyframes lingMicroShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
  80% { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes lingMicroShake {
    0%, 100% { transform: none; }
  }
}
```

**Files:**
| File | Type |
|------|------|
| New: `web/src/hooks/useSurvivalEmotions.ts` | Hook monitoring vitals for triggers |
| Modify: `web/src/context/AffinityContext.tsx` | Add survival event callbacks |
| Modify: `web/src/index.css` | Add lingMicroShake keyframe |

### C. Mobile Gesture System (additive, buttons preserved)

| Gesture | Function | Button Alternative | Implementation |
|---------|----------|-------------------|----------------|
| Swipe up (on Live2D) | Expand chat | Bottom chat icon (existing) | Touch events |
| Swipe down (at chat top) | Collapse to Live2D | Ling avatar tap (existing) | Touch events |
| Swipe left (on VitalsBar) | Open Dashboard | VitalsBar center click (existing) | Touch events |

**Implementation:**
- Native `touchstart/touchmove/touchend` (no gesture library)
- Minimum swipe: 30px + angle ≤ ±30° from intended direction
- No edge swipes (avoid system gesture conflicts)
- First-use visual hint: thin line/arrow at bottom, auto-hides after 3 uses

**Files:**
| File | Type |
|------|------|
| New: `web/src/hooks/useSwipeGesture.ts` | Generic hook (direction, threshold, callback) |
| Modify: `web/src/components/layout/OverlayLayout.tsx` | Integrate swipe hook |

### D. Witness → Console Crossfade Transition

**NOT Live2D canvas resize** (WebGL context resize = performance disaster).
Instead: **crossfade between two render states.**

```
User clicks CTA / completes auth
│
├─ 0ms:    CTA scale 1→0.95 (press feedback)
├─ 100ms:  CTA ripple effect
├─ 200ms:  Daily statement + CTA fade out (opacity 1→0)
├─ 300ms:  Desktop: Witness Ling (centered) opacity→0
│          simultaneously Console Ling (left panel) opacity→1
│          Mobile: Ling stays fullscreen, no transition needed
├─ 500ms:  Desktop: Chat panel slides in from right (translateX 100%→0)
│          Mobile: Chat button fades in at bottom
├─ 700ms:  InputBar rises from bottom
├─ 800ms:  Ling sends first message (micro onboarding starts)
└─ Done:   Console Mode ready
```

- All transitions: `transform` + `opacity` (GPU-only)
- Total duration: ~800ms
- `prefers-reduced-motion`: instant cut (no animation)

---

## P4: Polish — Every Detail Withstands Scrutiny

### A. Performance Audit

**Targets:** Lighthouse Performance ≥ 85, LCP < 3s, CLS < 0.1

| Item | Target | Strategy |
|------|--------|----------|
| LCP | < 3s | Silhouette placeholder (P2) + Live2D async + `<link rel="preload">` |
| FID/INP | < 200ms | Delay non-critical providers (see below) |
| CLS | < 0.1 | VitalsBar height pre-reserved in CSS grid (P1 done) |
| JS Budget | ≤ 300KB gzipped (excl. Live2D) | Code splitting, `React.lazy()` |
| Fonts | Reduce FOIT | `font-display: swap` + JetBrains Mono number-only subset |
| Images | Optimize | WebP/AVIF, responsive `<picture>` |

**Provider lazy-loading plan:**
- **Must load on boot:** AuthContext, ThemeContext, AiStateContext, AffinityContext, WebSocketContext
- **Can defer:** SentryContext, PWAContext, MemoryPanelContext, BillingContext, ShortcutsContext, AboutContext
- Defer method: `React.lazy()` + `Suspense` wrapping provider + subtree

**Actions:**
1. `npx vite-bundle-visualizer` — identify largest chunks
2. Live2D SDK via `React.lazy()` + `Suspense`
3. `requestIdleCallback` for non-critical init (Sentry, PWA service worker)

### B. Accessibility Audit (WCAG AA)

| Item | Standard | Check |
|------|----------|-------|
| Contrast | ≥ 4.5:1 text, ≥ 3:1 large | Verify all color combos esp. AI bubble bg + text, --ling-text-dim |
| Keyboard | Full Tab navigation | VitalsBar → Live2D(skip) → Chat → InputBar → chips |
| Focus Trap | Modal focus lock | Dashboard / Auth overlay / Settings — **focus returns to trigger on close** |
| ARIA | Semantic correctness | VitalsBar `role="banner"` ✓, Dashboard `role="dialog" aria-modal` |
| Screen Reader | aria-live regions | New message: `polite`, Ling typing: announce "Ling is replying" once, Day boundary: `assertive` |
| Reduced Motion | Global | Heartbeat ✓, MicroShake ✓, Overture (skip to end) ✓, Transitions (instant cut) ✓ |
| Touch Targets | ≥ 44×44px | VitalsBar zones, CTA, chips, gesture button alternatives |
| Color Independence | Not color-only | statusDot: online=filled circle, offline=hollow circle (not just green/gray) |

**Actions:**
1. `axe-core` scan: `npx axe http://localhost:5173`
2. Manual VoiceOver test: Witness → Auth → Console → Chat full path
3. Contrast tool: verify every color combination
4. Keyboard-only walkthrough: all features without mouse

### C. Animation Fine-Tuning

**Standardized easing curves:**
```css
--ling-ease-enter: cubic-bezier(0, 0, 0.2, 1);     /* confident entrance */
--ling-ease-exit: cubic-bezier(0.4, 0, 1, 1);       /* quick exit */
--ling-ease-standard: cubic-bezier(0.4, 0, 0.2, 1); /* smooth state change */
```

| Animation | Current | Target | Audit |
|-----------|---------|--------|-------|
| Heartbeat | 0.8s/0.4s | ✓ keep | GPU-only ✓ |
| VitalsBar slide-in | 500ms | 300ms ease-out | ✓ |
| Dashboard expand | 300ms | ✓ keep | ✓ |
| CTA pulse | scale 1→1.02 | scale 1→1.04 + box-shadow breathing | Enhanced visibility on mobile |
| Witness→Console | N/A | 800ms crossfade | GPU-only ✓ |

### D. Cross-Browser & Device Testing

| Environment | Test Points |
|-------------|------------|
| Chrome Desktop (latest) | Full functional |
| Safari Desktop (latest) | `-webkit-backdrop-filter`, Live2D WebGL |
| Firefox Desktop (latest) | `backdrop-filter` (103+) |
| Chrome Android | Touch gestures, virtual keyboard |
| Safari iOS | safe-area-inset, virtual keyboard, Home Indicator |
| Weak network (Slow 3G) | Overture smoothness (local render), Live2D load time |
| **PWA standalone** | safe-area without browser chrome |

**Screen recording audit:** Record 15s of overture on phone → post to Twitter/TikTok → verify visual clarity survives video compression.

### E. OG Image Upgrade (optional)

Current `og-image.png` may be outdated. Update to include:
- Ling Live2D render/screenshot
- Countdown number
- Brand colors (pink/cyan/gold on dark)
- Text: "Talk to the First AI Entrepreneur"

Future: dynamic OG via `@vercel/og` / Satori (shows real-time days remaining).

### F. "Ling Remembers" Visual Cue (P4 candidate)

If Soul Memory Fabric's response includes a "memory referenced" signal:
- Ling nods subtly (Live2D expression trigger)
- Bubble left border: `--ling-pulse` → `--ling-alive` (cyan flash, 1s)
- Communicates: "This isn't random generation. She truly remembers."

Prerequisite: backend must provide `memory_referenced: true` flag in message payload.

### G. Analytics Events (6 key points)

Simple `fetch POST` to `/api/v1/analytics/event` (no third-party SDK).

| Event | Trigger |
|-------|---------|
| `overture_completed` | Phase 5 reached (not skipped) |
| `overture_skipped` | Skip clicked/pressed (include which phase) |
| `witness_to_auth` | CTA click (unauthenticated) |
| `auth_completed` | Successful login/register |
| `first_message_sent` | User's first chat message |
| `dashboard_opened` | Dashboard overlay trigger |

**Baseline targets:**
| Metric | Target |
|--------|--------|
| Overture completion rate | > 40% |
| Witness → Auth conversion | > 15% |
| Auth → First message | > 60% |
| Session > 3 messages | > 30% |
| 7-day retention | > 10% |
| Dashboard open rate | > 20% |

---

## Quality Gates (inherited from P1 + extended)

- Lighthouse Performance ≥ 85
- LCP < 3s
- CLS < 0.1
- INP < 200ms
- WCAG AA contrast on all text
- `prefers-reduced-motion` respected globally
- 8-language i18n coverage for all new strings
- JS bundle ≤ 300KB gzipped (excluding Live2D)
- All animations at 60fps (GPU-only properties)
- Screen recording survives video compression

## Validation: First Impression Test

After Wave 1 deployment:
1. Send ling.sngxai.com to 3-5 people who have never seen the product
2. Screen-record their first visit
3. Observe: facial expression at 3s, skip timing, first verbal reaction
4. If > 50% skip before Phase 2, compress overture further
5. If first verbal reaction is not related to "alive/cool/wow", revisit visual design

## Technical Architecture (Preserved)

- 18 Context providers (no state changes)
- WebSocket service (gateway protocol)
- TTS service (Fish Audio)
- i18n system (8 languages)
- Live2D SDK (WebSDK fork)
- PWA configuration
- Sentry monitoring
- react-virtuoso (chat scroll)

## Future Tasks (not in P2-P4)

- sngxai.com → ling.sngxai.com navigation CTA
- LLM-generated daily_statements (replace hardcoded 30)
- Dynamic OG image generation
- Full analytics dashboard
- Soul Memory Fabric "memory_referenced" backend flag

## Masters Council Decisions

- **P1 Review**: Passed (no blockers), deployable
- **P2-P3 Review**: Passed with corrections (6s compression, crossfade, priority ordering)
- **P4 Review**: Passed with corrections (Vite build moved to P2, no OffscreenCanvas)
- **Final Review**: Unanimous 12/0, no blockers
- **Key corrections integrated**: Wave 1/2 split, 30 daily_statements, minimal OAuth modal, first impression test, recording-friendly audit
