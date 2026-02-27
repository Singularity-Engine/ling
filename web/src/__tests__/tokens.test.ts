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
    expect(tokens).toContain('--ling-void-bottom: #07071a');
  });

  it('tokens.css generates legacy aliases derived FROM new tokens', () => {
    expect(tokens).toContain('--ling-purple: var(--ling-accent)');
    expect(tokens).toContain('--ling-purple-light: var(--ling-accent-light)');
    expect(tokens).toContain('--ling-text-primary: var(--ling-text-1)');
  });

  it('tokens.css derives --ling-bg-mid/warm from Section A void tokens', () => {
    expect(tokens).toContain('--ling-bg-mid: var(--ling-void-cool)');
    expect(tokens).toContain('--ling-bg-warm: var(--ling-void-warm)');
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
    const first200chars = indexCss.slice(0, 200);
    expect(first200chars).not.toContain('--ling-bg-deep:');
    expect(first200chars).not.toContain('--ling-purple:');
  });

  it('index.css no longer contains the old :root variable block', () => {
    expect(indexCss).not.toContain('/* 基底色 */');
    expect(indexCss).not.toContain('/* 主题紫 */');
  });

  it('has glassmorphism tokens', () => {
    expect(tokens).toContain('--ling-glass:');
    expect(tokens).toContain('--ling-glass-blur:');
    expect(tokens).toContain('--ling-glass-border:');
  });

  it('has display-lg font token (hero size)', () => {
    expect(tokens).toContain('--ling-font-display-lg:');
  });
});
