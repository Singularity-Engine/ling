import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Screen5 } from '../pages/sngxai/Screen5';
import { getTiers } from '../data/sngxai-tiers';

describe('Screen5', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/Screen5.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const tiers = getTiers();

  it('(render) renders headline', () => {
    const { container } = render(<Screen5 tiers={tiers} />);
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2?.textContent).toContain('boundary');
  });

  it('(render) renders Fracture component (SVG)', () => {
    const { container } = render(<Screen5 tiers={tiers} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('(render) CTA links to ling.sngxai.com', () => {
    const { container } = render(<Screen5 tiers={tiers} />);
    const cta = container.querySelector('a[href="https://ling.sngxai.com"]');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Talk to Ling');
  });

  it('(render) renders 4 tier cards', () => {
    const { container } = render(<Screen5 tiers={tiers} />);
    // Each CircleTier renders a div with data-visible
    const tierCards = container.querySelectorAll('[data-index]');
    expect(tierCards.length).toBe(4);
  });

  it('(render) Stardust tier has recommended badge', () => {
    const { container } = render(<Screen5 tiers={tiers} />);
    expect(container.textContent).toContain('Start here');
  });

  it('(static) CSS has safe-area-inset-bottom', () => {
    expect(css).toContain('safe-area-inset-bottom');
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});
