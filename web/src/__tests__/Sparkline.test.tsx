import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Sparkline } from '../pages/sngxai/Sparkline';

describe('Sparkline', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/Sparkline.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const testData = [0, 1, 2, 3, 5, 8, 10, 12];

  it('renders an SVG element', () => {
    const { container } = render(<Sparkline data={testData} animate={false} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders polyline with points', () => {
    const { container } = render(<Sparkline data={testData} animate={false} />);
    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
    const mainLine = polylines[polylines.length - 1];
    expect(mainLine.getAttribute('points')).toBeTruthy();
  });

  it('has aria-hidden="true"', () => {
    const { container } = render(<Sparkline data={testData} animate={false} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  it('animate prop controls CSS class', () => {
    const { container, rerender } = render(<Sparkline data={testData} animate={false} />);
    const polylines = container.querySelectorAll('polyline');
    const mainLine = polylines[polylines.length - 1];
    const classesBefore = mainLine.getAttribute('class') || '';

    rerender(<Sparkline data={testData} animate={true} />);
    const updatedPolylines = container.querySelectorAll('polyline');
    const updatedLine = updatedPolylines[updatedPolylines.length - 1];
    const classesAfter = updatedLine.getAttribute('class') || '';
    // When animate=true, more classes are applied (the animated variant)
    expect(classesAfter.length).toBeGreaterThan(classesBefore.length);
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('(static) CSS has sparkline-length CSS variable', () => {
    expect(css).toContain('--sparkline-length');
  });
});
