import { describe, it, expect } from 'vitest';
import { LING_GREETINGS, getLingGreeting } from '../data/ling-greetings';

describe('ling-greetings', () => {
  it('has at least 5 greetings', () => {
    expect(LING_GREETINGS.length).toBeGreaterThanOrEqual(5);
  });

  it('each greeting is non-empty and starts with uppercase or quote', () => {
    LING_GREETINGS.forEach((g) => {
      expect(g.length).toBeGreaterThan(0);
      expect(/^[A-Z"\u201C]/.test(g)).toBe(true);
    });
  });

  it('getLingGreeting() returns one of the greetings', () => {
    const result = getLingGreeting();
    expect(LING_GREETINGS).toContain(result);
  });
});
