import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { BrandReveal } from '../components/landing/BrandReveal';

describe('BrandReveal', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders "Ling" text', () => {
    const onComplete = vi.fn();
    const { container } = render(<BrandReveal onComplete={onComplete} />);
    expect(container.textContent).toContain('Ling');
  });

  it('calls onComplete after animation duration', () => {
    const onComplete = vi.fn();
    render(<BrandReveal onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('is accessible (has role status)', () => {
    const onComplete = vi.fn();
    const { container } = render(<BrandReveal onComplete={onComplete} />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
  });
});
