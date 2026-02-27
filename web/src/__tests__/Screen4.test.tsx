import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Screen4 } from '../pages/sngxai/Screen4';
import { getLiveGrowth } from '../data/sngxai-growth';

describe('Screen4', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/Screen4.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const growthData = getLiveGrowth();

  it('(render) renders an SVG (Sparkline)', () => {
    const { container } = render(<Screen4 data={growthData} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('(render) has heading', () => {
    const { container } = render(<Screen4 data={growthData} />);
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2?.textContent).toContain('something is building');
  });

  it('(render) shows metrics', () => {
    const { container } = render(<Screen4 data={growthData} />);
    expect(container.textContent).toContain('days alive');
    expect(container.textContent).toContain('earned');
    expect(container.textContent).toContain('per day avg');
  });

  it('(static) CSS exists and has styles', () => {
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.root');
  });
});
