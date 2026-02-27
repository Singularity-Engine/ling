import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ThinkingGlow } from '../components/dialogue/ThinkingGlow';

describe('ThinkingGlow', () => {
  it('renders glow when active', () => {
    const { container } = render(<ThinkingGlow active />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('does not render when inactive', () => {
    const { container } = render(<ThinkingGlow active={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('has deep class when deepThinking', () => {
    const { container } = render(<ThinkingGlow active deepThinking />);
    const glow = container.querySelector('[aria-hidden="true"]');
    expect(glow?.className).toContain('deep');
  });

  it('CSS has prefers-reduced-motion', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/ThinkingGlow.module.css'),
      'utf-8'
    );
    expect(css).toContain('prefers-reduced-motion');
  });

  it('renders role="status" text when active (P0-G)', () => {
    render(<ThinkingGlow active />);
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Ling is thinking');
  });

  it('status text includes "deeply" when deepThinking (P0-G)', () => {
    render(<ThinkingGlow active deepThinking />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('deeply');
  });
});
