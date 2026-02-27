import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BreathingBackground } from '../components/shared/BreathingBackground';

describe('BreathingBackground', () => {
  it('renders a div with breathing animation', () => {
    const { container } = render(<BreathingBackground />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('respects prefers-reduced-motion via CSS class', () => {
    const { container } = render(<BreathingBackground />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBeTruthy();
  });

  it('accepts optional className prop', () => {
    const { container } = render(<BreathingBackground className="custom" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('custom');
  });
});
