import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';

describe('AnimatedNumber', () => {
  it('renders each character in a separate span', () => {
    const { container } = render(<AnimatedNumber value="1,247" />);
    const spans = container.querySelectorAll('span[data-char]');
    expect(spans.length).toBe(5); // 1 , 2 4 7
  });

  it('applies staggered animation delay', () => {
    const { container } = render(<AnimatedNumber value="47" />);
    const spans = container.querySelectorAll('span[data-char]');
    const style0 = (spans[0] as HTMLElement).style.animationDelay;
    const style1 = (spans[1] as HTMLElement).style.animationDelay;
    expect(style0).toBe('0ms');
    expect(style1).toBe('30ms');
  });

  it('accepts a label for accessibility', () => {
    const { container } = render(<AnimatedNumber value="47" label="Day count" />);
    const el = container.querySelector('[aria-label]');
    expect(el?.getAttribute('aria-label')).toBe('Day count');
  });
});
