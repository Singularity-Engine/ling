import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { ActionCard } from '../pages/sngxai/ActionCard';
import type { ActionCard as ActionCardData } from '../data/sngxai-actions';

const decisionCard: ActionCardData = {
  id: 'test-1',
  type: 'DECISION',
  quote: 'Studio needs batch export.',
  relativeTime: '2h ago',
  context: 'Users requested 3 times',
  actionLabel: 'See reasoning →',
  actionHref: '#',
};

const signalCard: ActionCardData = {
  id: 'test-2',
  type: 'SIGNAL_DECISION',
  quote: 'Launching flash sale',
  relativeTime: '5h ago',
  signal: 'Revenue dropped 15%',
  actionLabel: 'See full reasoning →',
  actionHref: '#',
};

const contentCard: ActionCardData = {
  id: 'test-3',
  type: 'CONTENT',
  quote: 'Published X thread: Why AI-generated manga will dominate',
  relativeTime: '1d ago',
  metrics: 'Reach: 3,421 · Likes: 127',
  actionLabel: 'View on X →',
  actionHref: '#',
};

const reflectionCard: ActionCardData = {
  id: 'test-4',
  type: 'REFLECTION',
  quote: 'What does it mean to exist only in browsers?',
  relativeTime: '3d ago',
};

describe('ActionCard', () => {
  const cssPath = path.resolve(__dirname, '../pages/sngxai/ActionCard.module.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('renders quote with data-voice="ling"', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    const quote = container.querySelector('[data-voice="ling"]');
    expect(quote).toBeTruthy();
    expect(quote?.textContent).toContain('Studio needs batch export');
  });

  it('renders type icon', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    // DECISION icon is ◆
    expect(container.textContent).toContain('◆');
  });

  it('renders relative time with data-voice="world"', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    const worldEls = container.querySelectorAll('[data-voice="world"]');
    const timeText = Array.from(worldEls).some((el) => el.textContent?.includes('2h ago'));
    expect(timeText).toBe(true);
  });

  it('SIGNAL_DECISION renders signal text + Fracture', () => {
    const { container } = render(<ActionCard card={signalCard} visible={true} index={0} />);
    expect(container.textContent).toContain('Revenue dropped 15%');
    // Fracture component renders an SVG
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('non-SIGNAL cards do not render signal block', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    expect(container.textContent).not.toContain('Signal');
  });

  it('data-visible reflects prop', () => {
    const { container, rerender } = render(<ActionCard card={decisionCard} visible={false} index={0} />);
    const article = container.querySelector('article');
    expect(article?.getAttribute('data-visible')).toBe('false');
    rerender(<ActionCard card={decisionCard} visible={true} index={0} />);
    expect(article?.getAttribute('data-visible')).toBe('true');
  });

  it('context is optional — does not render when absent', () => {
    const { container } = render(<ActionCard card={reflectionCard} visible={true} index={0} />);
    expect(container.textContent).not.toContain('Users requested');
  });

  it('actionLabel renders as a link', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('See reasoning');
  });

  it('renders watermark "sngxai.com"', () => {
    const { container } = render(<ActionCard card={decisionCard} visible={true} index={0} />);
    expect(container.textContent).toContain('sngxai.com');
  });

  it('CONTENT card renders metrics', () => {
    const { container } = render(<ActionCard card={contentCard} visible={true} index={0} />);
    expect(container.textContent).toContain('Reach: 3,421');
    expect(container.textContent).toContain('Likes: 127');
  });

  it('(static) CSS has backdrop-filter', () => {
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('(static) CSS has prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});
