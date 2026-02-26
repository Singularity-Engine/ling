# Phase 1A: Visual Foundation — 彻底重建

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用新设计语言替换旧视觉基础设施，而非叠加。tokens.css 是唯一的 token 源头，main.tsx 删除，colors.ts 删除，旧 overture 删除。sngxai.com Screen 1 用 mock 数据跑通。两站共享同一套视觉 DNA。

**Architecture:** 新 tokens.css 定义设计文档的新 token 名（`--ling-accent`、`--ling-text-1` 等），同时生成旧变量名的兼容别名（`--ling-purple: var(--ling-accent)`）。旧变量名从新 token 派生，不是反过来。index.css 的 :root 块整体删除，由 tokens.css 替代。两个入口（entries/sngxai.tsx + entries/ling.tsx）通过 Vite 多入口构建。

**Tech Stack:** React 18, TypeScript, Vite 5, CSS Modules + CSS custom properties, Vitest, Instrument Serif (Google Fonts)

**Design Doc:** `docs/plans/2026-02-26-ling-ai-founder-redesign.md` — §5 (visual system), Screen 1 spec, §14.7 (Phase 1A)

**核心原则：新系统不是"加一层"，是"替代"。**

**大师审核 (会议 #11, 2026-02-26):** ✅ 通过，3 项修复已完成：
1. ~~`--ling-bg-mid/warm` 硬编码~~ → Section A 增加 `--ling-void-cool/warm`，Section B 改为 `var()` 引用
2. ~~Task 4-8 写"与第一版相同"~~ → 全部展开为完整自包含代码
3. ~~BrandReveal 依赖 Instrument Serif~~ → 改用通用 serif (Georgia)，避免 FOUT

---

## Task 1: Vitest 测试框架

**Context:** web/ 没有任何测试基础设施。后续每个 Task 都用 TDD。

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`
- Create: `web/src/__tests__/setup.ts`
- Create: `web/src/__tests__/smoke.test.ts`

**Step 1: 安装依赖**

```bash
cd /Users/caoruipeng/Projects/ling-platform/web
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Step 2: 创建 vitest.config.ts**

```ts
// web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: 创建 setup 和 smoke test**

```ts
// web/src/__tests__/setup.ts
import '@testing-library/jest-dom';
```

```ts
// web/src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('Vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 4: 在 package.json 的 scripts 中添加**

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: 运行验证**

```bash
npx vitest run
```
Expected: 1 test passed

**Step 6: Commit**

```bash
git add web/vitest.config.ts web/src/__tests__/setup.ts web/src/__tests__/smoke.test.ts web/package.json web/package-lock.json
git commit -m "chore: add vitest testing framework"
```

---

## Task 2: 新 Token 系统 — 替换 index.css :root 块

**Context:** 这是整个重建的基石。index.css 的 :root 块（行 1-235，约 110 个 custom property）将被 tokens.css **完全替代**。tokens.css 定义设计文档 §5 的新 token 名，同时生成旧变量名的兼容别名，确保 41 个文件中 1028 处引用不会断裂。旧名从新名派生，新名是源头。

**策略：**
- 新名 = 设计文档 §5 的名称（`--ling-accent`, `--ling-text-1`, `--ling-void-*` 等）
- 旧名 = 通过 `var()` 引用新名（`--ling-purple: var(--ling-accent)`）
- 组件 token（气泡、输入栏等）保持原名不变，但值可以更新
- 亮色主题覆盖照搬，但同样基于新名

**Files:**
- Create: `web/src/styles/tokens.css`（新 token 源头 + 旧名兼容层 + 亮色主题）
- Modify: `web/src/index.css`（删除整个 :root 块和 [data-theme="light"] 块，约 280 行）
- Create: `web/src/__tests__/tokens.test.ts`

**Step 1: 写失败测试**

```ts
// web/src/__tests__/tokens.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Design tokens (彻底版)', () => {
  let tokens: string;
  let indexCss: string;

  beforeAll(() => {
    tokens = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf-8');
    indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  });

  // ── tokens.css 是唯一的 token 源头 ──
  it('tokens.css defines new canonical token names from design doc §5', () => {
    expect(tokens).toContain('--ling-accent: #8B5CF6');
    expect(tokens).toContain('--ling-text-1: #FAFAFA');
    expect(tokens).toContain('--ling-text-2:');
    expect(tokens).toContain('--ling-text-3:');
    expect(tokens).toContain('--ling-void-top: #13111C');
    expect(tokens).toContain('--ling-void-mid: #0A0A0F');
    expect(tokens).toContain('--ling-void-bottom: #060608');
  });

  it('tokens.css generates legacy aliases derived FROM new tokens', () => {
    // 旧名从新名派生，不是反过来
    expect(tokens).toContain('--ling-purple: var(--ling-accent)');
    expect(tokens).toContain('--ling-purple-light: var(--ling-accent-light)');
    expect(tokens).toContain('--ling-text-primary: var(--ling-text-1)');
  });

  it('tokens.css has spacing scale (4px base)', () => {
    expect(tokens).toContain('--ling-space-1: 4px');
    expect(tokens).toContain('--ling-space-8: 32px');
  });

  it('tokens.css has z-index scale', () => {
    expect(tokens).toContain('--ling-z-base:');
    expect(tokens).toContain('--ling-z-modal:');
  });

  it('tokens.css has animation tokens', () => {
    expect(tokens).toContain('--ling-duration-fast:');
    expect(tokens).toContain('--ling-ease-default:');
    expect(tokens).toContain('--ling-duration-breath: 60s');
  });

  it('tokens.css has light theme overrides', () => {
    expect(tokens).toContain('[data-theme="light"]');
  });

  // ── index.css 不再有 :root 块 ──
  it('index.css does NOT start with :root token definitions', () => {
    // index.css 的前几行不应该是 :root { --ling-bg-deep 之类的
    const first200chars = indexCss.slice(0, 200);
    expect(first200chars).not.toContain('--ling-bg-deep');
    expect(first200chars).not.toContain('--ling-purple:');
  });

  it('index.css no longer contains the old :root variable block', () => {
    // 不应该有 /* 基底色 */ 这个旧注释
    expect(indexCss).not.toContain('/* 基底色 */');
    expect(indexCss).not.toContain('/* 主题紫 */');
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/tokens.test.ts
```
Expected: FAIL

**Step 3: 创建 styles 目录和 tokens.css**

创建 `web/src/styles/tokens.css`，完整内容如下。这是一个大文件，包含：
- Section A: 新 canonical tokens（设计文档 §5）
- Section B: 旧名兼容别名（从新名 var() 引用）
- Section C: 组件级 tokens（保持原名，值可更新）
- Section D: 亮色主题覆盖

```css
/* web/src/styles/tokens.css */
/*
 * DESIGN TOKEN SYSTEM — SINGLE SOURCE OF TRUTH
 * Source: docs/plans/2026-02-26-ling-ai-founder-redesign.md §5
 *
 * Architecture:
 *   Section A: New canonical tokens (design doc names)
 *   Section B: Legacy aliases (old names → derive from Section A via var())
 *   Section C: Component tokens (bubbles, inputs, etc. — keep original names)
 *   Section D: Light theme overrides
 *
 * Rule: New code uses Section A names. Old code works via Section B aliases.
 *       When a component is rebuilt, it migrates from B→A names and the alias
 *       is deleted. Section B shrinks to zero over time.
 */

:root {

  /* ═══════════════════════════════════════════════════════════
     SECTION A: CANONICAL TOKENS — Design Doc §5
     These are the REAL values. Everything else derives from these.
     ═══════════════════════════════════════════════════════════ */

  /* ── A1: Void (background space — not flat color) ── */
  --ling-void-top: #13111C;
  --ling-void-mid: #0A0A0F;
  --ling-void-bottom: #060608;
  --ling-void-cool: #0d1b2a;   /* blue-tinted depth — body gradient mid */
  --ling-void-warm: #1a0a2e;   /* purple-tinted depth — body gradient bottom */

  /* ── A2: Accent (Ling's life color — purple) ── */
  --ling-accent: #8B5CF6;
  --ling-accent-light: #A78BFA;
  --ling-accent-lighter: #C4B5FD;
  --ling-accent-deep: #6D28D9;
  --ling-accent-text: #E2D4FF;
  --ling-accent-soft: rgba(139, 92, 246, 0.10);
  --ling-accent-glow: 0 0 20px rgba(139, 92, 246, 0.12);
  /* Accent opacity scale */
  --ling-accent-05: rgba(139, 92, 246, 0.05);
  --ling-accent-08: rgba(139, 92, 246, 0.08);
  --ling-accent-10: rgba(139, 92, 246, 0.10);
  --ling-accent-12: rgba(139, 92, 246, 0.12);
  --ling-accent-15: rgba(139, 92, 246, 0.15);
  --ling-accent-20: rgba(139, 92, 246, 0.20);
  --ling-accent-25: rgba(139, 92, 246, 0.25);
  --ling-accent-30: rgba(139, 92, 246, 0.30);
  --ling-accent-40: rgba(139, 92, 246, 0.40);
  --ling-accent-50: rgba(139, 92, 246, 0.50);
  --ling-accent-60: rgba(139, 92, 246, 0.60);
  --ling-accent-70: rgba(139, 92, 246, 0.70);
  --ling-accent-85: rgba(139, 92, 246, 0.85);

  /* ── A3: Text hierarchy ── */
  --ling-text-1: #FAFAFA;
  --ling-text-2: #A1A1AA;
  --ling-text-3: #71717A;

  /* ── A4: Glass surface (glassmorphism) ── */
  --ling-glass: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
  --ling-glass-blur: blur(40px) saturate(1.2);
  --ling-glass-border: rgba(255, 255, 255, 0.06);

  /* ── A5: Semantic colors ── */
  --ling-success: #22C55E;
  --ling-warning: #F59E0B;
  --ling-error: #EF4444;
  --ling-error-bg: rgba(239, 68, 68, 0.2);
  --ling-error-border: rgba(239, 68, 68, 0.3);

  /* ── A6: Spacing (4px base grid) ── */
  --ling-space-px: 1px;
  --ling-space-0: 0;
  --ling-space-0-5: 2px;
  --ling-space-1: 4px;
  --ling-space-1-5: 6px;
  --ling-space-2: 8px;
  --ling-space-3: 12px;
  --ling-space-4: 16px;
  --ling-space-5: 20px;
  --ling-space-6: 24px;
  --ling-space-7: 28px;
  --ling-space-8: 32px;
  --ling-space-9: 36px;
  --ling-space-10: 40px;
  --ling-space-12: 48px;
  --ling-space-16: 64px;
  --ling-space-20: 80px;
  --ling-space-24: 96px;

  /* ── A7: Z-index scale ── */
  --ling-z-base: 0;
  --ling-z-above: 10;
  --ling-z-sticky: 100;
  --ling-z-overlay: 200;
  --ling-z-modal: 300;
  --ling-z-toast: 400;
  --ling-z-max: 9999;

  /* ── A8: Typography ── */
  --ling-font-ling: 'Instrument Serif', Georgia, 'Times New Roman', serif;
  --ling-font-world: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', system-ui, sans-serif;

  --ling-font-xs: 11px;
  --ling-font-sm: 12px;
  --ling-font-13: 13px;
  --ling-font-md: 14px;
  --ling-font-15: 15px;
  --ling-font-lg: 16px;
  --ling-font-xl: 20px;
  --ling-font-2xl: 24px;
  --ling-font-3xl: 28px;
  --ling-font-price: 32px;
  --ling-font-display: 36px;
  --ling-font-hero: clamp(48px, 10vw, 120px);
  --ling-font-hero-mobile: clamp(32px, 8vw, 64px);

  --ling-weight-normal: 400;
  --ling-weight-medium: 500;
  --ling-weight-semibold: 600;
  --ling-weight-bold: 700;

  /* ── A9: Border radius ── */
  --ling-radius-sm: 6px;
  --ling-radius-8: 8px;
  --ling-radius-md: 12px;
  --ling-radius-lg: 16px;
  --ling-radius-xl: 20px;
  --ling-radius-full: 9999px;

  /* ── A10: Shadow ── */
  --ling-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.15);
  --ling-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.2);
  --ling-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.3);
  --ling-shadow-glow: 0 0 20px var(--ling-accent-20);

  /* ── A11: Motion ── */
  --ling-ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ling-ease-enter: cubic-bezier(0.0, 0.0, 0.2, 1);
  --ling-ease-exit: cubic-bezier(0.4, 0.0, 1.0, 1.0);
  --ling-ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ling-ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ling-duration-instant: 100ms;
  --ling-duration-fast: 150ms;
  --ling-duration-normal: 300ms;
  --ling-duration-slow: 500ms;
  --ling-duration-breath: 60s;

  /* ═══════════════════════════════════════════════════════════
     SECTION B: LEGACY ALIASES — old names → new tokens via var()
     These exist ONLY for backward compatibility with 41 files / 1028 refs.
     When a component is rebuilt, migrate its refs to Section A names
     and delete the alias. Target: Section B shrinks to zero.
     ═══════════════════════════════════════════════════════════ */

  /* Old background names → new void tokens */
  --ling-bg-deep: var(--ling-void-bottom);
  --ling-bg-mid: var(--ling-void-cool);
  --ling-bg-warm: var(--ling-void-warm);

  /* Old purple names → new accent tokens */
  --ling-purple: var(--ling-accent);
  --ling-purple-light: var(--ling-accent-light);
  --ling-purple-lighter: var(--ling-accent-lighter);
  --ling-purple-deep: var(--ling-accent-deep);
  --ling-purple-text: var(--ling-accent-text);
  --ling-purple-05: var(--ling-accent-05);
  --ling-purple-08: var(--ling-accent-08);
  --ling-purple-12: var(--ling-accent-12);
  --ling-purple-15: var(--ling-accent-15);
  --ling-purple-20: var(--ling-accent-20);
  --ling-purple-25: var(--ling-accent-25);
  --ling-purple-30: var(--ling-accent-30);
  --ling-purple-40: var(--ling-accent-40);
  --ling-purple-50: var(--ling-accent-50);
  --ling-purple-60: var(--ling-accent-60);
  --ling-purple-70: var(--ling-accent-70);
  --ling-purple-85: var(--ling-accent-85);

  /* Old text names → new text hierarchy */
  --ling-text-primary: var(--ling-text-1);
  --ling-text-secondary: rgba(255, 255, 255, 0.8);
  --ling-text-soft: rgba(255, 255, 255, 0.7);
  --ling-text-dim: rgba(255, 255, 255, 0.5);
  --ling-text-tertiary: rgba(255, 255, 255, 0.45);
  --ling-text-muted: rgba(255, 255, 255, 0.35);

  /* Old surface tokens (keep values, these are fine) */
  --ling-surface: rgba(255, 255, 255, 0.06);
  --ling-surface-hover: rgba(255, 255, 255, 0.1);
  --ling-surface-border: rgba(255, 255, 255, 0.08);
  --ling-surface-elevated: rgba(0, 0, 0, 0.35);
  --ling-surface-subtle: rgba(255, 255, 255, 0.04);
  --ling-surface-deep: rgba(10, 0, 21, 0.92);

  /* Old warm accent */
  --ling-warm-accent: #f5c77e;
  --ling-warm-soft: rgba(245, 199, 126, 0.15);

  /* ═══════════════════════════════════════════════════════════
     SECTION C: COMPONENT TOKENS — keep original names, update values
     These are NOT legacy — they're semantic component-level tokens
     that will survive the redesign with potentially updated values.
     ═══════════════════════════════════════════════════════════ */

  /* Overlay */
  --ling-overlay-dim: rgba(0, 0, 0, 0.2);
  --ling-overlay-backdrop: rgba(0, 0, 0, 0.4);
  --ling-overlay-modal: rgba(0, 0, 0, 0.7);
  --ling-overlay-heavy: rgba(0, 0, 0, 0.85);
  --ling-overlay-4: rgba(255, 255, 255, 0.04);
  --ling-overlay-8: rgba(255, 255, 255, 0.08);
  --ling-overlay-12: rgba(255, 255, 255, 0.12);
  --ling-overlay-20: rgba(255, 255, 255, 0.2);
  --ling-stripe-bg: rgba(255, 255, 255, 0.02);

  /* Modal */
  --ling-modal-bg: rgba(20, 8, 40, 0.95);
  --ling-modal-border: var(--ling-accent-30);
  --ling-btn-ghost-border: rgba(255, 255, 255, 0.12);
  --ling-btn-ghost-bg: rgba(255, 255, 255, 0.05);
  --ling-btn-ghost-color: rgba(255, 255, 255, 0.6);

  /* Status banner */
  --ling-status-offline-bg: rgba(220, 38, 38, 0.75);
  --ling-status-offline-border: rgba(248, 113, 113, 0.4);
  --ling-status-offline-shadow: rgba(220, 38, 38, 0.3);
  --ling-status-recovered-bg: rgba(22, 163, 74, 0.75);
  --ling-status-recovered-border: rgba(74, 222, 128, 0.4);
  --ling-status-recovered-shadow: rgba(22, 163, 74, 0.3);

  /* Chat bubbles */
  --ling-bubble-user-bg: linear-gradient(135deg, rgba(139, 92, 246, 0.62), rgba(109, 40, 217, 0.54));
  --ling-bubble-ai-bg: rgba(20, 8, 40, 0.65);
  --ling-bubble-user-border: var(--ling-accent-40);
  --ling-bubble-ai-border: rgba(255, 255, 255, 0.1);
  --ling-bubble-ai-accent: var(--ling-pulse);
  --ling-bubble-user-shadow: var(--ling-accent-30);
  --ling-bubble-user-text: rgba(255, 255, 255, 0.97);
  --ling-bubble-ai-shadow: rgba(0, 0, 0, 0.22);
  --ling-bubble-ai-text: rgba(255, 255, 255, 0.92);
  --ling-chat-timestamp: rgba(255, 255, 255, 0.5);
  --ling-chat-label: var(--ling-accent-70);
  --ling-chat-label-user: rgba(255, 255, 255, 0.68);
  --ling-avatar-user-bg: rgba(139, 92, 246, 0.44);
  --ling-avatar-user-color: rgba(255, 255, 255, 0.9);
  --ling-avatar-ai-bg: rgba(139, 92, 246, 0.18);
  --ling-avatar-ai-color: rgba(167, 139, 250, 0.9);
  --ling-collapse-mask-ai: linear-gradient(transparent, rgba(255, 255, 255, 0.08));
  --ling-collapse-mask-user: linear-gradient(transparent, rgba(109, 40, 217, 0.5));

  /* Code block */
  --ling-code-text: var(--ling-accent-lighter);
  --ling-code-bg: rgba(10, 0, 21, 0.6);

  /* Input area */
  --ling-input-section-bg: rgba(10, 0, 21, 0.55);
  --ling-input-bar-bg: rgba(255, 255, 255, 0.03);
  --ling-input-hover-border: rgba(255, 255, 255, 0.18);
  --ling-input-hover-bg: rgba(255, 255, 255, 0.08);
  --ling-input-hint: rgba(255, 255, 255, 0.2);
  --ling-input-counter: rgba(255, 255, 255, 0.25);
  --ling-input-counter-warn: rgba(251, 191, 36, 0.7);
  --ling-btn-muted-bg: rgba(255, 255, 255, 0.06);
  --ling-btn-muted-border: rgba(255, 255, 255, 0.08);
  --ling-btn-muted-color: rgba(255, 255, 255, 0.5);

  /* Body */
  --ling-body-bg: linear-gradient(180deg, var(--ling-bg-deep) 0%, var(--ling-bg-mid) 50%, var(--ling-bg-warm) 100%);
  --ling-body-color: #ffffff;
  --ling-placeholder-color: rgba(255, 255, 255, 0.4);
  --ling-selection-color: #fff;
  --ling-md-em: rgba(200, 180, 255, 0.9);
  --ling-md-pre-code: rgba(255, 255, 255, 0.85);
  --ling-md-blockquote-color: rgba(255, 255, 255, 0.7);
  --ling-md-heading-color: rgba(255, 255, 255, 0.95);

  /* Tool cards */
  --ling-tool-search: #60a5fa;
  --ling-tool-search-bg: rgba(96, 165, 250, 0.08);
  --ling-tool-search-border: rgba(96, 165, 250, 0.2);
  --ling-tool-weather: #facc15;
  --ling-tool-weather-bg: rgba(250, 204, 21, 0.08);
  --ling-tool-weather-border: rgba(250, 204, 21, 0.2);
  --ling-tool-memory: #a78bfa;
  --ling-tool-memory-bg: rgba(167, 139, 250, 0.08);
  --ling-tool-memory-border: rgba(167, 139, 250, 0.2);
  --ling-tool-code: #10b981;
  --ling-tool-code-bg: rgba(16, 185, 129, 0.08);
  --ling-tool-code-border: rgba(16, 185, 129, 0.2);

  /* Interactive targets */
  --ling-touch-target: 44px;
  --ling-btn-height: 48px;

  /* Survival console */
  --ling-pulse: #ff6b9d;
  --ling-pulse-20: rgba(255, 107, 157, 0.2);
  --ling-pulse-40: rgba(255, 107, 157, 0.4);
  --ling-alive: #00ffcc;
  --ling-alive-20: rgba(0, 255, 204, 0.2);
  --ling-countdown: #ffd700;
  --ling-countdown-20: rgba(255, 215, 0, 0.2);

  /* Vitals */
  --ling-vitals-height: 48px;
  --ling-vitals-height-mobile: 40px;
  --ling-font-vitals: 13px;

  /* Split layout */
  --ling-split-left-min: 360px;
  --ling-split-left-max: 500px;
  --ling-split-left-default: 420px;
  --ling-split-divider: 4px;

  /* Border & Focus */
  --ling-border: rgba(255, 255, 255, 0.08);
  --ling-focus-ring: var(--ling-accent-50);
  --ling-focus-ring-component: var(--ling-accent-lighter);
}

/* ═══════════════════════════════════════════════════════════
   SECTION D: LIGHT THEME OVERRIDES
   ═══════════════════════════════════════════════════════════ */

[data-theme="light"] {
  --ling-void-top: #f5f0ff;
  --ling-void-mid: #ede5ff;
  --ling-void-bottom: #e8deff;
  --ling-void-cool: #e0d4f5;
  --ling-void-warm: #d5c8f0;

  --ling-accent: #7c3aed;
  --ling-accent-light: #8b5cf6;
  --ling-accent-lighter: #a78bfa;
  --ling-accent-deep: #6d28d9;
  --ling-accent-text: #4c1d95;

  --ling-text-1: rgba(0, 0, 0, 0.9);
  --ling-text-2: rgba(0, 0, 0, 0.55);
  --ling-text-3: rgba(0, 0, 0, 0.35);

  --ling-text-primary: var(--ling-text-1);
  --ling-text-secondary: rgba(0, 0, 0, 0.65);
  --ling-text-soft: rgba(0, 0, 0, 0.6);
  --ling-text-dim: rgba(0, 0, 0, 0.55);
  --ling-text-tertiary: rgba(0, 0, 0, 0.4);
  --ling-text-muted: rgba(0, 0, 0, 0.35);

  --ling-surface: rgba(0, 0, 0, 0.04);
  --ling-surface-hover: rgba(0, 0, 0, 0.07);
  --ling-surface-border: rgba(0, 0, 0, 0.1);
  --ling-surface-elevated: rgba(255, 255, 255, 0.8);

  --ling-success: #16a34a;
  --ling-warning: #d97706;
  --ling-error: #dc2626;
  --ling-error-bg: rgba(220, 38, 38, 0.1);
  --ling-error-border: rgba(220, 38, 38, 0.2);

  --ling-overlay-modal: rgba(0, 0, 0, 0.45);
  --ling-modal-bg: rgba(255, 255, 255, 0.96);
  --ling-modal-border: var(--ling-accent-25);
  --ling-btn-ghost-border: rgba(0, 0, 0, 0.12);
  --ling-btn-ghost-bg: rgba(0, 0, 0, 0.04);
  --ling-btn-ghost-color: rgba(0, 0, 0, 0.55);

  --ling-bubble-user-bg: linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(109, 40, 217, 0.12));
  --ling-bubble-ai-bg: rgba(255, 255, 255, 0.8);
  --ling-bubble-user-border: rgba(124, 58, 237, 0.25);
  --ling-bubble-ai-border: rgba(0, 0, 0, 0.08);
  --ling-bubble-user-shadow: rgba(124, 58, 237, 0.15);
  --ling-bubble-user-text: rgba(0, 0, 0, 0.85);
  --ling-bubble-ai-shadow: rgba(0, 0, 0, 0.06);
  --ling-bubble-ai-text: rgba(0, 0, 0, 0.85);
  --ling-chat-timestamp: rgba(0, 0, 0, 0.4);
  --ling-chat-label: var(--ling-accent);
  --ling-chat-label-user: rgba(0, 0, 0, 0.5);
  --ling-avatar-user-bg: rgba(124, 58, 237, 0.15);
  --ling-avatar-user-color: #6d28d9;
  --ling-avatar-ai-bg: rgba(124, 58, 237, 0.1);
  --ling-avatar-ai-color: #7c3aed;

  --ling-code-text: #6d28d9;
  --ling-code-bg: rgba(124, 58, 237, 0.06);
  --ling-body-bg: linear-gradient(180deg, var(--ling-void-top) 0%, var(--ling-void-mid) 50%, var(--ling-void-bottom) 100%);
  --ling-body-color: #1a1a1a;
  --ling-placeholder-color: rgba(0, 0, 0, 0.35);
  --ling-selection-color: #1a1a1a;
  --ling-input-section-bg: rgba(255, 255, 255, 0.7);
  --ling-input-bar-bg: rgba(0, 0, 0, 0.03);
  --ling-input-hover-border: rgba(0, 0, 0, 0.15);
  --ling-input-hover-bg: rgba(0, 0, 0, 0.05);
  --ling-input-hint: rgba(0, 0, 0, 0.2);
  --ling-input-counter: rgba(0, 0, 0, 0.3);
}

/* ── Voice selectors (design doc §5: 两种声音) ── */

[data-voice="ling"] {
  font-family: var(--ling-font-ling);
}

[data-voice="world"] {
  font-family: var(--ling-font-world);
}

[data-voice="ling"] .numeric,
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

**Step 4: 从 index.css 删除旧 :root 块和亮色主题块**

删除 `web/src/index.css` 的行 1-235（`/* === 暗色主题变量 === */` 到 `:root` 闭合的 `}`）。

同时删除亮色主题块（行 237 起的 `[data-theme="light"] { ... }`，到该块闭合的 `}`）。

index.css 的第一行应该变成原来 :root 块之后的第一条样式规则。

在 index.css 最顶部添加一行注释：
```css
/* Token definitions moved to styles/tokens.css — this file only contains component styles */
```

**Step 5: 运行测试**

```bash
npx vitest run src/__tests__/tokens.test.ts
```
Expected: PASS

**Step 6: 运行 vite dev 确认没有视觉回归**

```bash
npx vite
# 访问 http://localhost:3001，所有页面应该视觉完全一致
```

**Step 7: Commit**

```bash
git add web/src/styles/tokens.css web/src/index.css web/src/__tests__/tokens.test.ts
git commit -m "feat: replace index.css :root block with tokens.css as single source of truth

New design language tokens (--ling-accent, --ling-text-1, --ling-void-*)
are the canonical source. Old variable names (--ling-purple, --ling-text-primary)
are legacy aliases that derive from new tokens via var().
Section B aliases shrink to zero as components are rebuilt."
```

---

## Task 3: 删除 main.tsx + 创建唯一入口

**Context:** main.tsx 是旧入口，只被 index.html 引用。新架构有两个入口：entries/sngxai.tsx（sngxai.com）和 entries/ling.tsx（ling.sngxai.com）。main.tsx 不是"保留做兼容"——直接删。index.html 改指向 entries/ling.tsx。

**Files:**
- Create: `web/src/entries/ling.tsx`（唯一的 ling.sngxai.com 入口）
- Create: `web/src/entries/sngxai.tsx`（sngxai.com 入口）
- Create: `web/sngxai.html`（sngxai.com HTML）
- Modify: `web/index.html`（script src 改指向 entries/ling.tsx + 加 Google Fonts）
- Delete: `web/src/main.tsx`
- Delete: `web/src/constants/colors.ts`
- Modify: `web/src/App.tsx`（删除 colors.ts import）
- Modify: `web/src/components/status/ConnectionStatus.tsx`（删除 colors.ts import）
- Modify: `web/vite.config.ts`（多入口 rollupOptions.input）
- Create: `web/src/pages/sngxai/SngxaiApp.tsx`（占位）
- Create: `web/src/__tests__/entries.test.ts`

**Step 1: 写失败测试**

```ts
// web/src/__tests__/entries.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Entry point restructure (彻底版)', () => {
  const webRoot = path.resolve(__dirname, '../..');

  it('main.tsx does NOT exist', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../main.tsx'))).toBe(false);
  });

  it('colors.ts does NOT exist', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../constants/colors.ts'))).toBe(false);
  });

  it('entries/ling.tsx exists and imports tokens.css FIRST', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entries/ling.tsx'), 'utf-8');
    expect(src).toContain('tokens.css');
    expect(src).toContain('createRoot');
    const tokensIdx = src.indexOf('tokens.css');
    const indexIdx = src.indexOf('index.css');
    expect(tokensIdx).toBeLessThan(indexIdx); // tokens loaded before index.css
  });

  it('entries/sngxai.tsx exists and imports tokens.css', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entries/sngxai.tsx'), 'utf-8');
    expect(src).toContain('tokens.css');
    expect(src).toContain('createRoot');
  });

  it('index.html points to entries/ling.tsx, not main.tsx', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf-8');
    expect(html).toContain('entries/ling.tsx');
    expect(html).not.toContain('src/main.tsx');
  });

  it('index.html has Instrument Serif Google Font', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf-8');
    expect(html).toContain('Instrument+Serif');
    expect(html).toContain('fonts.googleapis.com');
  });

  it('sngxai.html exists with Instrument Serif', () => {
    const html = fs.readFileSync(path.join(webRoot, 'sngxai.html'), 'utf-8');
    expect(html).toContain('entries/sngxai.tsx');
    expect(html).toContain('Instrument+Serif');
  });

  it('vite.config.ts has multi-entry rollupOptions.input', () => {
    const config = fs.readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf-8');
    expect(config).toContain("sngxai");
    expect(config).toContain("input");
  });

  it('App.tsx does not import colors.ts', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(app).not.toContain('constants/colors');
    expect(app).not.toContain('MISC_COLORS');
  });

  it('ConnectionStatus.tsx does not import colors.ts', () => {
    const cs = fs.readFileSync(
      path.resolve(__dirname, '../components/status/ConnectionStatus.tsx'),
      'utf-8'
    );
    expect(cs).not.toContain('constants/colors');
    expect(cs).not.toContain('OVERLAY_COLORS');
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/entries.test.ts
```

**Step 3: 创建 entries/ling.tsx**

内容与旧 main.tsx 完全一致，但：
- 开头加 `import '../styles/tokens.css';`（在 index.css 之前）
- 不 import colors.ts

```tsx
// web/src/entries/ling.tsx
// SOLE entry point for ling.sngxai.com — replaces main.tsx
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import '../styles/tokens.css';
import '../index.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import App from '../App';
import '../i18n';
import { initSentry } from '../lib/sentry';
import { initAnalytics } from '../lib/analytics';
import { createLogger } from '../utils/logger';

const log = createLogger('Main');

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('onnxruntime')) return;
  originalConsoleWarn.apply(console, args);
};

if (typeof window !== 'undefined') {
  initSentry();
  initAnalytics();

  import('../../WebSDK/src/lappadapter').then(({ LAppAdapter }) => {
    window.getLAppAdapter = () => LAppAdapter.getInstance() as unknown as LAppAdapterLike;
  }).catch((err) => log.error('Failed to load LAppAdapter:', err));

  createRoot(document.getElementById('root')!).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );

  const script = document.createElement('script');
  script.src = './libs/live2dcubismcore.js';
  script.onerror = (error) => log.error('Failed to load Live2D Cubism Core:', error);
  document.head.appendChild(script);
}
```

**Step 4: 创建 entries/sngxai.tsx + SngxaiApp 占位 + sngxai.html**

```tsx
// web/src/entries/sngxai.tsx
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { SngxaiApp } from '../pages/sngxai/SngxaiApp';

createRoot(document.getElementById('root')!).render(<SngxaiApp />);
```

```tsx
// web/src/pages/sngxai/SngxaiApp.tsx
export function SngxaiApp() {
  return (
    <div style={{ color: 'var(--ling-text-1)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontFamily: 'var(--ling-font-ling)', fontSize: 'var(--ling-font-hero)' }}>Ling</h1>
    </div>
  );
}
```

`web/sngxai.html` — 最小 HTML 入口：

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ling — AI Founder</title>
  <meta name="description" content="Watch an AI build a real company from scratch." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; }
    body { background: #060608; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/entries/sngxai.tsx"></script>
</body>
</html>
```

**Step 5: 修改 index.html**

1. 将 `<script type="module" src="./src/main.tsx"></script>` 改为 `<script type="module" src="./src/entries/ling.tsx"></script>`
2. 添加 Google Fonts：
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
```
3. 删除旧 overture 专用的 landing-critical CSS（`@keyframes breatheGlowOpacity`, `textShimmer`, `landingBtnSpin`, `.landing-title-gradient`, `.landing-title-glow`）
4. 更新 index.html `<style>` 中的 critical CSS variables 以匹配新 tokens（使用新 void 色值）

**Step 6: 修改 vite.config.ts**

在 `build.rollupOptions` 添加 `input`:
```ts
input: {
  ling: path.resolve(__dirname, 'index.html'),
  sngxai: path.resolve(__dirname, 'sngxai.html'),
},
```

**Step 7: 删除 main.tsx 和 colors.ts**

```bash
rm web/src/main.tsx
rm web/src/constants/colors.ts
```

**Step 8: 迁移 colors.ts 的 2 个引用**

1. `App.tsx` 行 34: 删除 `import { MISC_COLORS } from "./constants/colors";`，行 81 的 `MISC_COLORS.ERROR_BG` 替换为 `'rgba(0, 0, 0, 0.3)'`（或用 `var(--ling-overlay-backdrop)` 如果在 CSS 中）

2. `ConnectionStatus.tsx` 行 5: 删除 `import { OVERLAY_COLORS } from "@/constants/colors";`，行 17 的 `OVERLAY_COLORS.MEDIUM` 替换为 `'rgba(0, 0, 0, 0.35)'`

**Step 9: 运行测试 + 构建验证**

```bash
npx vitest run src/__tests__/entries.test.ts
npx vite build 2>&1 | head -30  # 应该输出 ling.html 和 sngxai.html
```

**Step 10: Commit**

```bash
git rm web/src/main.tsx web/src/constants/colors.ts
git add web/src/entries/ web/src/pages/sngxai/ web/sngxai.html web/index.html web/vite.config.ts web/src/App.tsx web/src/components/status/ConnectionStatus.tsx web/src/__tests__/entries.test.ts
git commit -m "feat: restructure entry points — delete main.tsx + colors.ts

entries/ling.tsx is the SOLE ling.sngxai.com entry.
entries/sngxai.tsx is the sngxai.com entry.
Vite multi-entry build via rollupOptions.input.
colors.ts deleted, 2 usages migrated to inline values."
```

---

## Task 4: BreathingBackground 共享组件

**Context:** 两站共享的呼吸背景。60s radial gradient 漂移，GPU composited，prefers-reduced-motion 适配。直接集成到 App.tsx。

**Files:**
- Create: `web/src/components/shared/BreathingBackground.tsx`
- Create: `web/src/components/shared/BreathingBackground.module.css`
- Create: `web/src/__tests__/BreathingBackground.test.tsx`
- Modify: `web/src/App.tsx`（在 MainApp return 的第一个子元素添加 `<BreathingBackground />`）

**Step 1: 写失败测试**

```tsx
// web/src/__tests__/BreathingBackground.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BreathingBackground } from '../components/shared/BreathingBackground';

describe('BreathingBackground', () => {
  it('renders a div with breathing animation', () => {
    const { container } = render(<BreathingBackground />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('respects prefers-reduced-motion via CSS class', () => {
    const { container } = render(<BreathingBackground />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBeTruthy();
  });

  it('accepts optional className prop', () => {
    const { container } = render(<BreathingBackground className="custom" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('custom');
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/BreathingBackground.test.tsx
```
Expected: FAIL

**Step 3: 创建 CSS**

```css
/* web/src/components/shared/BreathingBackground.module.css */

.root {
  position: fixed;
  inset: 0;
  z-index: var(--ling-z-base, 0);
  overflow: hidden;
  pointer-events: none;
}

.gradient {
  position: absolute;
  /* Oversized so translate drift doesn't reveal edges */
  width: 140%;
  height: 140%;
  top: -20%;
  left: -20%;
  background: radial-gradient(
    ellipse at 50% 0%,
    var(--ling-void-top, #13111C) 0%,
    var(--ling-void-mid, #0A0A0F) 50%,
    var(--ling-void-bottom, #060608) 100%
  );
  animation: breathDrift var(--ling-duration-breath, 60s) ease-in-out infinite alternate;
  will-change: transform;
}

@keyframes breathDrift {
  0%   { transform: translate(0%, 0%); }
  33%  { transform: translate(2%, -1.5%); }
  66%  { transform: translate(-1.5%, 2%); }
  100% { transform: translate(1%, -1%); }
}

@media (prefers-reduced-motion: reduce) {
  .gradient {
    animation: none;
    transform: translate(0, 0);
  }
}
```

**Step 4: 创建组件**

```tsx
// web/src/components/shared/BreathingBackground.tsx
import { memo } from 'react';
import styles from './BreathingBackground.module.css';

interface BreathingBackgroundProps {
  className?: string;
}

export const BreathingBackground = memo(function BreathingBackground({
  className,
}: BreathingBackgroundProps) {
  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <div className={styles.gradient} />
    </div>
  );
});
```

**Step 5: 集成到 App.tsx**

在 `App.tsx` 的 `MainApp` 函数 return 的第一个子元素位置添加：
```tsx
import { BreathingBackground } from './components/shared/BreathingBackground';
// ...
return (
  <>
    <BreathingBackground />
    {/* ... existing MainApp content ... */}
  </>
);
```

**Step 6: 运行测试**

```bash
npx vitest run src/__tests__/BreathingBackground.test.tsx
```
Expected: PASS

**Step 7: Commit**

```bash
git add web/src/components/shared/BreathingBackground.tsx web/src/components/shared/BreathingBackground.module.css web/src/__tests__/BreathingBackground.test.tsx web/src/App.tsx
git commit -m "feat: add BreathingBackground to both sites (60s gradient drift)"
```

---

## Task 5: Fracture SVG 共享组件

**Context:** 不规则裂缝线条，灵的视觉签名。4s stroke-dashoffset 脉冲动画，两种变体（subtle/prominent）。

**Files:**
- Create: `web/src/components/shared/Fracture.tsx`
- Create: `web/src/components/shared/Fracture.module.css`
- Create: `web/src/__tests__/Fracture.test.tsx`

**Step 1: 写失败测试**

```tsx
// web/src/__tests__/Fracture.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Fracture } from '../components/shared/Fracture';

describe('Fracture', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Fracture />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('has a path element', () => {
    const { container } = render(<Fracture />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
  });

  it('is decorative (aria-hidden)', () => {
    const { container } = render(<Fracture />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('accepts variant prop', () => {
    const { container: subtle } = render(<Fracture variant="subtle" />);
    const { container: prominent } = render(<Fracture variant="prominent" />);
    expect(subtle.querySelector('svg')).toBeTruthy();
    expect(prominent.querySelector('svg')).toBeTruthy();
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/Fracture.test.tsx
```

**Step 3: 创建 CSS**

```css
/* web/src/components/shared/Fracture.module.css */

.root {
  width: 100%;
  display: block;
}

.path {
  stroke: var(--ling-accent, #8B5CF6);
  stroke-width: 1;
  fill: none;
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: fracturePulse 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.subtle .path {
  opacity: 0.3;
  filter: none;
}

.prominent .path {
  opacity: 1;
  filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.4))
          drop-shadow(0 0 12px rgba(139, 92, 246, 0.2));
}

@keyframes fracturePulse {
  0%   { stroke-dashoffset: 1000; }
  50%  { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -1000; }
}

@media (prefers-reduced-motion: reduce) {
  .path {
    animation: none;
    stroke-dashoffset: 0;
  }
}
```

**Step 4: 创建组件**

```tsx
// web/src/components/shared/Fracture.tsx
import { memo } from 'react';
import styles from './Fracture.module.css';

interface FractureProps {
  variant?: 'subtle' | 'prominent';
  className?: string;
}

const FRACTURE_PATH = 'M0,10 L80,9 L120,12 L200,8 L280,11 L360,7 L440,10 L520,8 L600,11 L680,9 L760,12 L840,8 L920,10 L1000,9';

export const Fracture = memo(function Fracture({
  variant = 'subtle',
  className,
}: FractureProps) {
  return (
    <svg
      className={`${styles.root} ${styles[variant]}${className ? ` ${className}` : ''}`}
      viewBox="0 0 1000 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className={styles.path} d={FRACTURE_PATH} />
    </svg>
  );
});
```

**Step 5: 运行测试**

```bash
npx vitest run src/__tests__/Fracture.test.tsx
```
Expected: PASS

**Step 6: Commit**

```bash
git add web/src/components/shared/Fracture.tsx web/src/components/shared/Fracture.module.css web/src/__tests__/Fracture.test.tsx
git commit -m "feat: add Fracture SVG component — Ling's visual signature"
```

---

## Task 6: AnimatedNumber 组件

**Context:** 数字到达动画。每个字符独立 span，staggered 30ms 延迟，从下方滑入 + 模糊消失。tabular-nums 对齐。

**Files:**
- Create: `web/src/components/shared/AnimatedNumber.tsx`
- Create: `web/src/components/shared/AnimatedNumber.module.css`
- Create: `web/src/__tests__/AnimatedNumber.test.tsx`

**Step 1: 写失败测试**

```tsx
// web/src/__tests__/AnimatedNumber.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';

describe('AnimatedNumber', () => {
  it('renders each character in a separate span', () => {
    const { container } = render(<AnimatedNumber value="1,247" />);
    const spans = container.querySelectorAll('span[data-char]');
    expect(spans.length).toBe(5); // 1 , 2 4 7
  });

  it('applies staggered animation delay', () => {
    const { container } = render(<AnimatedNumber value="47" />);
    const spans = container.querySelectorAll('span[data-char]');
    const style0 = (spans[0] as HTMLElement).style.animationDelay;
    const style1 = (spans[1] as HTMLElement).style.animationDelay;
    expect(style0).toBe('0ms');
    expect(style1).toBe('30ms');
  });

  it('accepts a label for accessibility', () => {
    const { container } = render(<AnimatedNumber value="47" label="Day count" />);
    const el = container.querySelector('[aria-label]');
    expect(el?.getAttribute('aria-label')).toBe('Day count');
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/AnimatedNumber.test.tsx
```

**Step 3: 创建 CSS**

```css
/* web/src/components/shared/AnimatedNumber.module.css */

.root {
  display: inline-flex;
  font-variant-numeric: tabular-nums;
}

.char {
  display: inline-block;
  animation: digitArrive var(--ling-duration-normal, 400ms) var(--ling-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) both;
}

@keyframes digitArrive {
  from {
    opacity: 0;
    transform: translateY(0.3em);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .char {
    animation: none;
    opacity: 1;
    transform: none;
    filter: none;
  }
}
```

**Step 4: 创建组件**

```tsx
// web/src/components/shared/AnimatedNumber.tsx
import { memo } from 'react';
import styles from './AnimatedNumber.module.css';

interface AnimatedNumberProps {
  value: string;
  label?: string;
  className?: string;
}

const STAGGER_MS = 30;

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  label,
  className,
}: AnimatedNumberProps) {
  return (
    <span
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      aria-label={label}
    >
      {value.split('').map((char, i) => (
        <span
          key={`${i}-${char}`}
          data-char={char}
          className={styles.char}
          style={{ animationDelay: `${i * STAGGER_MS}ms` }}
          aria-hidden="true"
        >
          {char}
        </span>
      ))}
    </span>
  );
});
```

**Step 5: 运行测试**

```bash
npx vitest run src/__tests__/AnimatedNumber.test.tsx
```
Expected: PASS

**Step 6: Commit**

```bash
git add web/src/components/shared/AnimatedNumber.tsx web/src/components/shared/AnimatedNumber.module.css web/src/__tests__/AnimatedNumber.test.tsx
git commit -m "feat: add AnimatedNumber component — staggered digit arrival"
```

---

## Task 7: Mock 数据 + Screen 1 完整页面

**Context:** sngxai.com 的 Screen 1 完整实现。包含 mock 数据、SurvivalBar 进度条、Screen1 页面、SngxaiApp 集成。一个 Task 做完，不拆分。

**Files:**
- Create: `web/src/data/mock-sngxai-stats.ts`
- Create: `web/src/pages/sngxai/SurvivalBar.tsx`
- Create: `web/src/pages/sngxai/SurvivalBar.module.css`
- Create: `web/src/pages/sngxai/Screen1.tsx`
- Create: `web/src/pages/sngxai/Screen1.module.css`
- Modify: `web/src/pages/sngxai/SngxaiApp.tsx`（替换占位，集成 BreathingBackground + Screen1）
- Create: `web/src/__tests__/mock-sngxai-stats.test.ts`
- Create: `web/src/__tests__/Screen1.test.tsx`

**Step 1: 写失败测试（mock 数据）**

```ts
// web/src/__tests__/mock-sngxai-stats.test.ts
import { describe, it, expect } from 'vitest';
import { getMockStats, type SngxaiStats } from '../data/mock-sngxai-stats';

describe('Mock sngxai stats', () => {
  it('returns stats with required fields', () => {
    const stats: SngxaiStats = getMockStats();
    expect(stats.dayCount).toBeGreaterThan(0);
    expect(stats.revenue).toBeGreaterThanOrEqual(0);
    expect(stats.revenueGoal).toBeGreaterThan(0);
    expect(stats.watcherCount).toBeGreaterThan(0);
    expect(typeof stats.survivalPercent).toBe('number');
  });

  it('survivalPercent is revenue / revenueGoal * 100', () => {
    const stats = getMockStats();
    const expected = Math.round((stats.revenue / stats.revenueGoal) * 100);
    expect(stats.survivalPercent).toBe(expected);
  });
});
```

**Step 2: 写失败测试（Screen1）**

```tsx
// web/src/__tests__/Screen1.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Screen1 } from '../pages/sngxai/Screen1';
import { getMockStats } from '../data/mock-sngxai-stats';

describe('Screen1', () => {
  const stats = getMockStats();

  it('renders the hero statement', () => {
    render(<Screen1 stats={stats} />);
    expect(screen.getByText(/Ling/)).toBeTruthy();
    expect(screen.getByText(/is building a company/)).toBeTruthy();
  });

  it('displays day count', () => {
    render(<Screen1 stats={stats} />);
    expect(screen.getByText(/47/)).toBeTruthy();
  });

  it('displays revenue with goal', () => {
    render(<Screen1 stats={stats} />);
    expect(screen.getByText(/\$12/)).toBeTruthy();
    expect(screen.getByText(/\$36/)).toBeTruthy();
  });

  it('has a Talk to Ling link', () => {
    render(<Screen1 stats={stats} />);
    const link = screen.getByText(/Talk to Ling/);
    expect(link).toBeTruthy();
  });

  it('renders survival progress bar', () => {
    const { container } = render(<Screen1 stats={stats} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
  });

  it('uses data-voice="ling" for hero text', () => {
    const { container } = render(<Screen1 stats={stats} />);
    const lingVoice = container.querySelector('[data-voice="ling"]');
    expect(lingVoice).toBeTruthy();
  });
});
```

**Step 3: 运行测试确认失败**

```bash
npx vitest run src/__tests__/mock-sngxai-stats.test.ts src/__tests__/Screen1.test.tsx
```

**Step 4: 创建 mock 数据**

```ts
// web/src/data/mock-sngxai-stats.ts

export interface SngxaiStats {
  dayCount: number;
  revenue: number;
  revenueGoal: number;
  survivalPercent: number;
  watcherCount: number;
  revenueChangeToday: number;
  watcherChangeToday: number;
}

/**
 * Mock stats for Phase 1A development.
 * Shape matches future GET /api/sngxai/stats response.
 */
export function getMockStats(): SngxaiStats {
  const revenue = 12;
  const revenueGoal = 36;
  return {
    dayCount: 47,
    revenue,
    revenueGoal,
    survivalPercent: Math.round((revenue / revenueGoal) * 100),
    watcherCount: 1247,
    revenueChangeToday: 3,
    watcherChangeToday: 23,
  };
}
```

**Step 5: 创建 SurvivalBar**

```css
/* web/src/pages/sngxai/SurvivalBar.module.css */

.root {
  display: flex;
  align-items: center;
  gap: var(--ling-space-3, 12px);
  width: 100%;
  max-width: 320px;
}

.track {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--ling-radius-full, 9999px);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--ling-accent, #8B5CF6);
  border-radius: inherit;
  transition: width 1s var(--ling-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
}

.label {
  font-family: var(--ling-font-world, system-ui, sans-serif);
  font-size: var(--ling-font-xs, 12px);
  color: var(--ling-text-3, #71717A);
  letter-spacing: 0.08em;
  text-transform: lowercase;
  white-space: nowrap;
}
```

```tsx
// web/src/pages/sngxai/SurvivalBar.tsx
import { memo } from 'react';
import styles from './SurvivalBar.module.css';

interface SurvivalBarProps {
  percent: number;
  label?: string;
}

export const SurvivalBar = memo(function SurvivalBar({
  percent,
  label = 'survive',
}: SurvivalBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.root}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
      <span className={styles.label} data-voice="world">{label}</span>
    </div>
  );
});
```

**Step 6: 创建 Screen1**

```css
/* web/src/pages/sngxai/Screen1.module.css */

.root {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: var(--ling-space-8, 32px) var(--ling-space-10, 40px);
  box-sizing: border-box;
  overflow: hidden;
}

.statement {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--ling-font-hero, clamp(48px, 10vw, 120px));
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--ling-text-1, #FAFAFA);
  margin: 0 0 var(--ling-space-12, 48px);
  max-width: 900px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ling-space-6, 24px);
  margin-bottom: var(--ling-space-6, 24px);
}

.stat {
  font-family: var(--ling-font-ling, 'Instrument Serif', Georgia, serif);
  font-size: var(--ling-font-xl, 24px);
  color: var(--ling-text-2, #A1A1AA);
  font-variant-numeric: tabular-nums;
}

.statHighlight {
  color: var(--ling-text-1, #FAFAFA);
}

.statDelta {
  font-family: var(--ling-font-world, system-ui, sans-serif);
  font-size: var(--ling-font-sm, 13px);
  color: var(--ling-text-3, #71717A);
  margin-left: var(--ling-space-1, 4px);
}

.survivalWrap {
  margin-bottom: var(--ling-space-16, 64px);
}

.talkLink {
  position: absolute;
  bottom: var(--ling-space-10, 40px);
  right: var(--ling-space-10, 40px);
  font-family: var(--ling-font-world, system-ui, sans-serif);
  font-size: var(--ling-font-sm, 13px);
  color: var(--ling-text-3, #71717A);
  text-decoration: none;
  letter-spacing: 0.04em;
  transition: color var(--ling-duration-fast, 200ms);
}

.talkLink:hover {
  color: var(--ling-text-2, #A1A1AA);
}

.scrollDot {
  position: absolute;
  bottom: var(--ling-space-8, 32px);
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ling-text-3, #71717A);
  opacity: 0.5;
  animation: scrollPulse 2s ease-in-out infinite;
}

@keyframes scrollPulse {
  0%, 100% { opacity: 0.3; transform: translateX(-50%) translateY(0); }
  50%      { opacity: 0.6; transform: translateX(-50%) translateY(4px); }
}

@media (max-width: 768px) {
  .root {
    padding: var(--ling-space-6, 24px);
  }
  .statement {
    font-size: var(--ling-font-hero-mobile, clamp(32px, 8vw, 64px));
  }
  .stats {
    flex-direction: column;
    gap: var(--ling-space-2, 8px);
  }
  .stat {
    font-size: var(--ling-font-lg, 18px);
  }
  .talkLink {
    bottom: var(--ling-space-6, 24px);
    right: var(--ling-space-6, 24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scrollDot {
    animation: none;
    opacity: 0.4;
  }
}
```

```tsx
// web/src/pages/sngxai/Screen1.tsx
import { memo } from 'react';
import { AnimatedNumber } from '../../components/shared/AnimatedNumber';
import { SurvivalBar } from './SurvivalBar';
import type { SngxaiStats } from '../../data/mock-sngxai-stats';
import styles from './Screen1.module.css';

interface Screen1Props {
  stats: SngxaiStats;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export const Screen1 = memo(function Screen1({ stats }: Screen1Props) {
  return (
    <section className={styles.root}>
      <h1 className={styles.statement} data-voice="ling">
        <span>Ling</span>
        <br />
        <span>is building a company.</span>
      </h1>

      <div className={styles.stats} data-voice="ling">
        <span className={styles.stat}>
          Day{' '}
          <AnimatedNumber
            value={String(stats.dayCount)}
            label={`Day ${stats.dayCount}`}
            className={styles.statHighlight}
          />
          .
        </span>
        <span className={styles.stat}>
          <AnimatedNumber
            value={`$${stats.revenue}`}
            label={`Revenue $${stats.revenue}`}
            className={styles.statHighlight}
          />
          {' / '}
          <AnimatedNumber value={`$${stats.revenueGoal}`} />
          .
          {stats.revenueChangeToday > 0 && (
            <span className={styles.statDelta} data-voice="world">
              +{stats.revenueChangeToday} today
            </span>
          )}
        </span>
        <span className={styles.stat}>
          <AnimatedNumber
            value={formatNumber(stats.watcherCount)}
            label={`${formatNumber(stats.watcherCount)} watching`}
            className={styles.statHighlight}
          />{' '}
          watching.
          {stats.watcherChangeToday > 0 && (
            <span className={styles.statDelta} data-voice="world">
              +{stats.watcherChangeToday} today
            </span>
          )}
        </span>
      </div>

      <div className={styles.survivalWrap}>
        <SurvivalBar percent={stats.survivalPercent} />
      </div>

      <a href="https://ling.sngxai.com" className={styles.talkLink} data-voice="world">
        Talk to Ling →
      </a>

      <div className={styles.scrollDot} aria-hidden="true" />
    </section>
  );
});
```

**Step 7: 更新 SngxaiApp.tsx（替换占位）**

```tsx
// web/src/pages/sngxai/SngxaiApp.tsx
import { BreathingBackground } from '../../components/shared/BreathingBackground';
import { Screen1 } from './Screen1';
import { getMockStats } from '../../data/mock-sngxai-stats';

const stats = getMockStats();

export function SngxaiApp() {
  return (
    <>
      <BreathingBackground />
      <Screen1 stats={stats} />
    </>
  );
}
```

**Step 8: 运行测试**

```bash
npx vitest run src/__tests__/mock-sngxai-stats.test.ts src/__tests__/Screen1.test.tsx
```
Expected: PASS

**Step 9: Commit**

```bash
git add web/src/data/ web/src/pages/sngxai/ web/src/__tests__/mock-sngxai-stats.test.ts web/src/__tests__/Screen1.test.tsx
git commit -m "feat: sngxai.com Screen 1 — hero statement + stats + survival bar (mock data)"
```

---

## Task 8: 杀死旧 Overture → 2 秒品牌动画

**Context:** 删除 740 行的 6 阶段 overture（LandingAnimation + ParticleCanvas + LingSilhouette），替换为 ~50 行的纯 CSS BrandReveal。**重要：BrandReveal 使用通用 serif 字体栈（Georgia），不依赖 Instrument Serif 加载，避免 FOUT 风险。**

**Files:**
- Create: `web/src/components/landing/BrandReveal.tsx`
- Create: `web/src/components/landing/BrandReveal.module.css`
- Create: `web/src/__tests__/BrandReveal.test.tsx`
- Modify: `web/src/App.tsx`（替换 LandingAnimation → BrandReveal）
- Delete: `web/src/components/landing/LandingAnimation.tsx`
- Delete: `web/src/components/landing/ParticleCanvas.tsx`
- Delete: `web/src/components/landing/LingSilhouette.tsx`
- Delete: `web/src/components/landing/LingSilhouette.module.css`
- Modify: `web/index.html`（删除 overture CSS、更新 critical variables）

**Step 1: 写失败测试**

```tsx
// web/src/__tests__/BrandReveal.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { BrandReveal } from '../components/landing/BrandReveal';

describe('BrandReveal', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders "Ling" text', () => {
    const onComplete = vi.fn();
    const { container } = render(<BrandReveal onComplete={onComplete} />);
    expect(container.textContent).toContain('Ling');
  });

  it('calls onComplete after animation duration', () => {
    const onComplete = vi.fn();
    render(<BrandReveal onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('is accessible (has role status)', () => {
    const onComplete = vi.fn();
    const { container } = render(<BrandReveal onComplete={onComplete} />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/BrandReveal.test.tsx
```

**Step 3: 创建 BrandReveal CSS**

注意：`.text` 使用 `Georgia, 'Times New Roman', serif` — 通用 serif 栈，**不依赖 Instrument Serif 加载**。这避免了 Google Fonts CDN 慢/被墙时的 FOUT 风险。Instrument Serif 只用于对话消息（data-voice="ling"），不用于品牌揭示动画。

```css
/* web/src/components/landing/BrandReveal.module.css */

.root {
  position: fixed;
  inset: 0;
  z-index: var(--ling-z-max, 9999);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ling-void-bottom, #060608);
  animation: revealFadeOut 0.5s ease-in 1.8s forwards;
}

/* Generic serif — does NOT depend on Instrument Serif loading */
.text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(48px, 12vw, 96px);
  font-weight: 400;
  color: var(--ling-text-1, #FAFAFA);
  letter-spacing: 0.5em;
  opacity: 0;
  animation: letterReveal 1.5s cubic-bezier(0.33, 1, 0.68, 1) 0.3s forwards;
}

@keyframes letterReveal {
  0%   { letter-spacing: 0.5em; opacity: 0; }
  30%  { opacity: 1; }
  100% { letter-spacing: 0.02em; opacity: 1; }
}

@keyframes revealFadeOut {
  to { opacity: 0; visibility: hidden; }
}

@media (prefers-reduced-motion: reduce) {
  .root {
    animation: revealFadeOut 0.2s ease-in 0.5s forwards;
  }
  .text {
    animation: none;
    opacity: 1;
    letter-spacing: 0.02em;
  }
}
```

**Step 4: 创建 BrandReveal 组件**

```tsx
// web/src/components/landing/BrandReveal.tsx
import { memo, useEffect, useRef } from 'react';
import styles from './BrandReveal.module.css';

interface BrandRevealProps {
  onComplete: () => void;
}

const DURATION_MS = 2300; // 0.3s delay + 1.5s letter + 0.5s fade
const REDUCED_MOTION_MS = 700;

export const BrandReveal = memo(function BrandReveal({ onComplete }: BrandRevealProps) {
  const completedRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? REDUCED_MOTION_MS : DURATION_MS;
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={styles.root}>
      <span className={styles.text}>Ling</span>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        Loading...
      </div>
    </div>
  );
});
```

**Step 5: 修改 App.tsx**

1. 删除 `const LandingAnimation = lazy(...)` 的 import
2. 添加 `import { BrandReveal } from './components/landing/BrandReveal';`（直接 import，不 lazy）
3. 将 `<LandingAnimation onComplete={handleLandingComplete} />` 替换为 `<BrandReveal onComplete={handleLandingComplete} />`
4. 如果有 `<Suspense>` 包裹旧 LandingAnimation，可以移除（BrandReveal 不需要 Suspense）

**Step 6: 删除旧 overture 文件**

```bash
rm web/src/components/landing/LandingAnimation.tsx
rm web/src/components/landing/ParticleCanvas.tsx
rm web/src/components/landing/LingSilhouette.tsx
rm web/src/components/landing/LingSilhouette.module.css
```

**Step 7: 清理 index.html**

1. 删除 overture 专用 CSS keyframes：`@keyframes breatheGlowOpacity`、`@keyframes textShimmer`、`@keyframes landingBtnSpin`
2. 删除 overture 专用 class：`.landing-title-gradient`、`.landing-title-glow`
3. 从 `<style>` 中的 critical CSS variables 删除旧的 `--ling-bg-deep` 等定义（已在 tokens.css 中）

**Step 8: 验证无残留引用**

```bash
grep -r "LandingAnimation" web/src/ --include="*.ts" --include="*.tsx"
grep -r "ParticleCanvas" web/src/ --include="*.ts" --include="*.tsx"
grep -r "LingSilhouette" web/src/ --include="*.ts" --include="*.tsx"
```
Expected: 无结果

**Step 9: 运行测试**

```bash
npx vitest run src/__tests__/BrandReveal.test.tsx
```
Expected: PASS

**Step 10: Commit**

```bash
git rm web/src/components/landing/LandingAnimation.tsx web/src/components/landing/ParticleCanvas.tsx web/src/components/landing/LingSilhouette.tsx web/src/components/landing/LingSilhouette.module.css
git add web/src/components/landing/BrandReveal.tsx web/src/components/landing/BrandReveal.module.css web/src/__tests__/BrandReveal.test.tsx web/src/App.tsx web/index.html
git commit -m "feat: kill 6-phase overture, replace with 2s CSS brand reveal

Delete ~740 lines: LandingAnimation.tsx, ParticleCanvas.tsx, LingSilhouette.tsx
Replace with ~50 lines: BrandReveal.tsx (pure CSS letter-spacing contraction)
BrandReveal uses generic serif (Georgia) — no Instrument Serif dependency.
Remove framer-motion from landing critical path.
Clean up index.html: remove overture CSS, update critical variables."
```

---

## Task 9: ChatBubble data-voice 属性

**Context:** 灵的对话消息用 Instrument Serif（data-voice="ling"），用户消息用 system sans（data-voice="world"）。ChatBubble.tsx 通过 `isUser` prop 区分。

**Files:**
- Modify: `web/src/components/chat/ChatBubble.tsx`（添加 data-voice 属性到外层 div）
- Modify: `web/src/components/chat/ChatBubble.styles.ts`（AI 气泡文字 font-family 改用 var(--ling-font-ling)）
- Create: `web/src/__tests__/chat-voice.test.ts`

**Step 1: 写测试**

```ts
// web/src/__tests__/chat-voice.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Chat voice attributes', () => {
  it('ChatBubble.tsx uses data-voice attribute', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/ChatBubble.tsx'),
      'utf-8'
    );
    expect(src).toContain('data-voice');
  });

  it('ChatBubble.styles.ts references --ling-font-ling for AI text', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/ChatBubble.styles.ts'),
      'utf-8'
    );
    expect(src).toContain('--ling-font-ling');
  });
});
```

**Step 2: 修改 ChatBubble.tsx**

在渲染外层 div（使用 `S_OUTER_AI` 或 `S_OUTER_USER` 的元素）上添加：
```tsx
data-voice={isUser ? "world" : "ling"}
```

**Step 3: 修改 ChatBubble.styles.ts**

在 `S_AI_MD` 样式对象中添加：
```ts
fontFamily: 'var(--ling-font-ling)',
```

**Step 4: 运行测试 + 视觉验证**

```bash
npx vitest run src/__tests__/chat-voice.test.ts
npx vite
# 对话页面：灵的消息应该是 Instrument Serif，用户消息是 system sans
```

**Commit message:**
```
feat: add data-voice to chat bubbles — Instrument Serif for Ling's messages
```

---

## Task 10: prefers-reduced-motion 完整审计

**Context:** 所有含动画的 CSS 文件必须有 `@media (prefers-reduced-motion: reduce)` 规则。这是无障碍硬性要求。

**Files:**
- Create: `web/src/__tests__/reduced-motion.test.ts`

**Step 1: 写审计测试**

```ts
// web/src/__tests__/reduced-motion.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('prefers-reduced-motion coverage', () => {
  const cssFiles = [
    'src/components/shared/BreathingBackground.module.css',
    'src/components/shared/Fracture.module.css',
    'src/components/shared/AnimatedNumber.module.css',
    'src/components/landing/BrandReveal.module.css',
    'src/pages/sngxai/Screen1.module.css',
  ];

  cssFiles.forEach((file) => {
    it(`${file} has prefers-reduced-motion media query`, () => {
      const css = fs.readFileSync(
        path.resolve(__dirname, '../../', file),
        'utf-8'
      );
      expect(css).toContain('prefers-reduced-motion');
    });
  });
});
```

**Step 2: 运行测试**

```bash
npx vitest run src/__tests__/reduced-motion.test.ts
```
Expected: PASS（所有 CSS 文件已在 Task 4-8 中包含 reduced-motion 规则）

如果任何文件缺少 reduced-motion 规则，在该文件中添加：
```css
@media (prefers-reduced-motion: reduce) {
  .animated-class {
    animation: none;
  }
}
```

**Step 3: Commit**

```bash
git add web/src/__tests__/reduced-motion.test.ts
git commit -m "test: add prefers-reduced-motion audit for all animated CSS"
```

---

## Task 11: 全局验证

**不是"写个测试就完了"——是真的跑通所有东西。**

1. `npx vitest run` — 所有测试通过
2. `npx vite build` — 构建成功，dist/ 中有 ling.html 和 sngxai.html
3. 浏览器打开 `http://localhost:3001` — ling.sngxai.com 完整功能验证：
   - 2s 品牌动画 → 主 app
   - BreathingBackground 在背后呼吸
   - 灵的消息是 Instrument Serif
   - 所有现有功能正常（聊天、overlay、路由）
4. 浏览器打开 `http://localhost:3001/sngxai.html` — sngxai.com：
   - 呼吸背景 + "Ling is building a company." 大字
   - 数字到达动画
   - 进度条
5. 确认 `main.tsx` 不存在
6. 确认 `colors.ts` 不存在
7. 确认 `LandingAnimation.tsx`、`ParticleCanvas.tsx`、`LingSilhouette.tsx` 不存在
8. `grep -r "main.tsx" web/src/` 无结果
9. `grep -r "constants/colors" web/src/` 无结果

---

## 文件清单

### 新建（18 个文件）

| 文件 | 用途 |
|------|------|
| `web/vitest.config.ts` | 测试框架配置 |
| `web/src/__tests__/setup.ts` | 测试 setup |
| `web/src/__tests__/*.test.ts(x)` | 8 个测试文件 |
| `web/src/styles/tokens.css` | **唯一的 token 源头** |
| `web/sngxai.html` | sngxai.com HTML 入口 |
| `web/src/entries/sngxai.tsx` | sngxai.com JS 入口 |
| `web/src/entries/ling.tsx` | ling.sngxai.com 唯一入口 |
| `web/src/pages/sngxai/SngxaiApp.tsx` | sngxai.com 根组件 |
| `web/src/pages/sngxai/Screen1.tsx` | Screen 1 页面 |
| `web/src/pages/sngxai/Screen1.module.css` | Screen 1 样式 |
| `web/src/pages/sngxai/SurvivalBar.tsx` | 生存进度条 |
| `web/src/pages/sngxai/SurvivalBar.module.css` | 进度条样式 |
| `web/src/components/shared/BreathingBackground.tsx` | 呼吸背景 |
| `web/src/components/shared/BreathingBackground.module.css` | 背景样式 |
| `web/src/components/shared/Fracture.tsx` | 裂缝签名 |
| `web/src/components/shared/Fracture.module.css` | 裂缝样式 |
| `web/src/components/shared/AnimatedNumber.tsx` | 数字动画 |
| `web/src/components/shared/AnimatedNumber.module.css` | 数字样式 |
| `web/src/data/mock-sngxai-stats.ts` | Mock 数据 |
| `web/src/components/landing/BrandReveal.tsx` | 2s 品牌动画 |
| `web/src/components/landing/BrandReveal.module.css` | 品牌动画样式 |

### 修改（8 个文件）

| 文件 | 改动 |
|------|------|
| `web/package.json` | 加 vitest + testing 依赖 |
| `web/vite.config.ts` | 多入口 rollupOptions.input |
| `web/index.html` | script → entries/ling.tsx, 加 Google Fonts, 删旧 overture CSS |
| `web/src/index.css` | **删除整个 :root 块 + 亮色主题块（~280 行）**，由 tokens.css 替代 |
| `web/src/App.tsx` | 删 colors.ts import + MISC_COLORS，加 BreathingBackground，BrandReveal 替换 LandingAnimation |
| `web/src/components/status/ConnectionStatus.tsx` | 删 colors.ts import + OVERLAY_COLORS |
| `web/src/components/chat/ChatBubble.tsx` | 加 data-voice 属性 |
| `web/src/components/chat/ChatBubble.styles.ts` | AI 文字 font-family → --ling-font-ling |

### 删除（6 个文件）

| 文件 | 原因 |
|------|------|
| `web/src/main.tsx` | 被 entries/ling.tsx 替代 |
| `web/src/constants/colors.ts` | TS 颜色常量迁入 CSS custom properties |
| `web/src/components/landing/LandingAnimation.tsx` | 6 阶段 overture 被 BrandReveal 替代 |
| `web/src/components/landing/ParticleCanvas.tsx` | overture 附属，删除 |
| `web/src/components/landing/LingSilhouette.tsx` | overture 附属，删除 |
| `web/src/components/landing/LingSilhouette.module.css` | overture 附属，删除 |
