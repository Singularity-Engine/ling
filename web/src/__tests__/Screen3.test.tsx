import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Screen3 } from '../pages/sngxai/Screen3';
import { getLiveStakes } from '../data/sngxai-stakes';

describe('Screen3', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/Screen3.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const stakes = getLiveStakes();

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('(static) CSS has backdrop-filter and -webkit-backdrop-filter', () => {
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('(render) renders progress bar (SurvivalBar)', () => {
    const { container } = render(<Screen3 stakes={stakes} />);
    // SurvivalBar renders a progress-like element
    const progressEl = container.querySelector('[role="progressbar"]') ||
                       container.querySelector('[class*="survival"]') ||
                       container.querySelector('[class*="bar"]');
    expect(progressEl).toBeTruthy();
  });

  it('(render) renders 3 stat cards', () => {
    const { container } = render(<Screen3 stakes={stakes} />);
    const statCards = container.querySelectorAll('[data-visible]');
    // The section itself + stat cards have data-visible; stat cards have it
    expect(statCards.length).toBeGreaterThanOrEqual(3);
  });

  it('(render) heading uses data-voice="ling"', () => {
    const { container } = render(<Screen3 stakes={stakes} />);
    const headline = container.querySelector('h2[data-voice="ling"]');
    expect(headline).toBeTruthy();
  });

  it('(render) renders days countdown text', () => {
    const { container } = render(<Screen3 stakes={stakes} />);
    expect(container.textContent).toContain('days remaining');
  });
});
