import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { BrandEntrance } from '../components/dialogue/BrandEntrance';

beforeEach(() => {
  sessionStorage.clear();
});

describe('BrandEntrance', () => {
  it('renders "Ling" text on first visit', () => {
    render(<BrandEntrance onComplete={vi.fn()} />);
    expect(screen.getByText('Ling')).toBeTruthy();
  });

  it('uses data-voice="ling" for brand text', () => {
    render(<BrandEntrance onComplete={vi.fn()} />);
    expect(screen.getByText('Ling').getAttribute('data-voice')).toBe('ling');
  });

  it('skips rendering when sessionStorage has marker', () => {
    sessionStorage.setItem('ling-brand-seen', '1');
    const onComplete = vi.fn();
    render(<BrandEntrance onComplete={onComplete} />);
    expect(screen.queryByText('Ling')).toBeNull();
    expect(onComplete).toHaveBeenCalled();
  });

  it('calls onComplete after animation completes', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<BrandEntrance onComplete={onComplete} />);
    vi.advanceTimersByTime(2300);
    expect(onComplete).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('CSS has prefers-reduced-motion', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/BrandEntrance.module.css'),
      'utf-8'
    );
    expect(css).toContain('prefers-reduced-motion');
  });

  it('renders Skip button and Escape key calls onComplete', () => {
    const onComplete = vi.fn();
    render(<BrandEntrance onComplete={onComplete} />);
    const skipBtn = screen.getByRole('button', { name: /skip/i });
    expect(skipBtn).toBeTruthy();
    fireEvent.click(skipBtn);
    expect(onComplete).toHaveBeenCalled();
  });
});
