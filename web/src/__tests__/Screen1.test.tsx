import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Screen1 } from '../pages/sngxai/Screen1';
import { getLiveStats } from '../data/sngxai-stats';

describe('Screen1', () => {
  const stats = getLiveStats();

  it('renders the hero statement', () => {
    const { container } = render(<Screen1 stats={stats} />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toContain('Ling');
    expect(h1?.textContent).toContain('is building a company');
  });

  it('displays day count', () => {
    const { container } = render(<Screen1 stats={stats} />);
    const dayLabel = container.querySelector(`[aria-label="Day ${stats.dayCount}"]`);
    expect(dayLabel).toBeTruthy();
  });

  it('displays revenue with goal', () => {
    const { container } = render(<Screen1 stats={stats} />);
    const revenue = container.querySelector(`[aria-label="Revenue $${stats.revenue}"]`);
    expect(revenue).toBeTruthy();
    expect(container.textContent).toContain('$');
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
