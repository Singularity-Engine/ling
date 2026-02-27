import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { SngxaiApp } from '../pages/sngxai/SngxaiApp';

describe('SngxaiApp', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/SngxaiApp.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const appPath = path.resolve(__dirname, '../pages/sngxai/SngxaiApp.tsx');
  const appSrc = fs.readFileSync(appPath, 'utf-8');

  it('(static) CSS has scroll-snap-type: y mandatory', () => {
    expect(css).toContain('scroll-snap-type: y mandatory');
  });

  it('(static) CSS has scroll-snap-stop: always', () => {
    expect(css).toContain('scroll-snap-stop: always');
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('(static) CSS has env(safe-area-inset-bottom', () => {
    expect(css).toContain('env(safe-area-inset-bottom');
  });

  it('(render) renders 5 screen children', () => {
    const { container } = render(<SngxaiApp />);
    const screens = container.querySelectorAll('main > div');
    expect(screens.length).toBe(5);
  });

  it('(render) BreathingBackground is outside scroll container', () => {
    const { container } = render(<SngxaiApp />);
    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    // BreathingBackground should be a sibling, not a child of main
    const bgInMain = main?.querySelector('[class*="breathing"]');
    expect(bgInMain).toBeFalsy();
  });

  it('(static) SngxaiApp imports all data factories', () => {
    expect(appSrc).toContain('getLiveStats');
    expect(appSrc).toContain('getCuratedActions');
    expect(appSrc).toContain('getLiveStakes');
    expect(appSrc).toContain('getLiveGrowth');
    expect(appSrc).toContain('getTiers');
  });

  it('(static) SngxaiApp imports all 5 Screen components', () => {
    expect(appSrc).toContain("from './Screen1'");
    expect(appSrc).toContain("from './Screen2'");
    expect(appSrc).toContain("from './Screen3'");
    expect(appSrc).toContain("from './Screen4'");
    expect(appSrc).toContain("from './Screen5'");
  });

  it('(render) each screen has unique content', () => {
    const { container } = render(<SngxaiApp />);
    const text = container.textContent || '';
    // Screen1: brand identity
    expect(text).toContain('alive');
    // Screen2: actions
    expect(text).toContain('What Ling has been doing');
    // Screen3: stakes
    expect(text).toContain('days remaining');
    // Screen4: growth
    expect(text).toContain('something is building');
    // Screen5: CTA
    expect(text).toContain('boundary');
  });

  it('(render) renders ScrollIndicator', () => {
    const { container } = render(<SngxaiApp />);
    const dots = container.querySelectorAll('button[aria-label*="screen"]');
    expect(dots.length).toBe(5);
  });
});
