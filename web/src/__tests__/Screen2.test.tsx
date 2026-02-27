import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Screen2 } from '../pages/sngxai/Screen2';
import { getCuratedActions } from '../data/sngxai-actions';

describe('Screen2', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/Screen2.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const actions = getCuratedActions();

  it('(render) renders correct number of action cards', () => {
    const { container } = render(<Screen2 actions={actions} />);
    const articles = container.querySelectorAll('article');
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThanOrEqual(actions.length);
  });

  it('(render) has headline with data-voice="ling"', () => {
    const { container } = render(<Screen2 actions={actions} />);
    const headline = container.querySelector('h2[data-voice="ling"]');
    expect(headline).toBeTruthy();
    expect(headline?.textContent).toContain('What Ling has been doing');
  });

  it('(render) renders section with aria-label', () => {
    const { container } = render(<Screen2 actions={actions} />);
    const section = container.querySelector('section[aria-label]');
    expect(section).toBeTruthy();
  });

  it('(static) Screen2 CSS has mobile column layout', () => {
    expect(css).toContain('768px');
  });

  it('(static) Screen2 CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});
