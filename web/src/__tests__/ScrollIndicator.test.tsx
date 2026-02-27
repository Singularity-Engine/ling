import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { ScrollIndicator } from '../pages/sngxai/ScrollIndicator';

describe('ScrollIndicator', () => {
  it('renders correct number of dots', () => {
    const { container } = render(
      <ScrollIndicator totalScreens={5} activeIndex={0} />,
    );
    const dots = container.querySelectorAll('button');
    expect(dots.length).toBe(5);
  });

  it('active dot has data-active="true"', () => {
    const { container } = render(
      <ScrollIndicator totalScreens={5} activeIndex={2} />,
    );
    const dots = container.querySelectorAll('button');
    expect(dots[2].getAttribute('data-active')).toBe('true');
    expect(dots[0].getAttribute('data-active')).toBe('false');
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../pages/sngxai/ScrollIndicator.module.css'),
      'utf-8',
    );
    expect(css).toContain('prefers-reduced-motion');
  });

  it('dots have aria-label', () => {
    const { container } = render(
      <ScrollIndicator totalScreens={5} activeIndex={0} />,
    );
    const dots = container.querySelectorAll('button');
    expect(dots[2].getAttribute('aria-label')).toBe('Go to screen 3');
  });
});
