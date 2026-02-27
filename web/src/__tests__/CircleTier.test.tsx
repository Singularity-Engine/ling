import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { CircleTier } from '../pages/sngxai/CircleTier';
import type { TierData } from '../data/sngxai-tiers';

const basicTier: TierData = {
  name: 'Stardust',
  price: '$4.99',
  pricePeriod: '/mo',
  benefit: 'Talk to Ling directly.',
};

const recommendedTier: TierData = {
  ...basicTier,
  recommended: true,
};

const freeTier: TierData = {
  name: 'Free',
  price: '$0',
  pricePeriod: '',
  benefit: 'Watch Ling survive.',
};

describe('CircleTier', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/CircleTier.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('renders tier name with data-voice="ling"', () => {
    const { container } = render(<CircleTier tier={basicTier} visible={true} index={0} />);
    const nameEl = container.querySelector('[data-voice="ling"]');
    expect(nameEl).toBeTruthy();
    expect(nameEl?.textContent).toBe('Stardust');
  });

  it('renders price', () => {
    const { container } = render(<CircleTier tier={basicTier} visible={true} index={0} />);
    expect(container.textContent).toContain('$4.99');
  });

  it('renders benefit text', () => {
    const { container } = render(<CircleTier tier={basicTier} visible={true} index={0} />);
    expect(container.textContent).toContain('Talk to Ling directly');
  });

  it('data-visible reflects prop', () => {
    const { container, rerender } = render(<CircleTier tier={basicTier} visible={false} index={0} />);
    const card = container.firstElementChild;
    expect(card?.getAttribute('data-visible')).toBe('false');
    rerender(<CircleTier tier={basicTier} visible={true} index={0} />);
    expect(card?.getAttribute('data-visible')).toBe('true');
  });

  it('recommended tier shows "Start here" badge', () => {
    const { container } = render(<CircleTier tier={recommendedTier} visible={true} index={0} />);
    expect(container.textContent).toContain('Start here');
  });

  it('non-recommended tier does NOT show badge', () => {
    const { container } = render(<CircleTier tier={basicTier} visible={true} index={0} />);
    expect(container.textContent).not.toContain('Start here');
  });

  it('free tier shows "Enter free" CTA', () => {
    const { container } = render(<CircleTier tier={freeTier} visible={true} index={0} />);
    expect(container.textContent).toContain('Enter free');
  });

  it('(static) CSS has backdrop-filter and -webkit-backdrop-filter', () => {
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});
