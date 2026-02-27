import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import React from 'react';

// jsdom lacks scrollTo
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

// Mock heavy dependencies
vi.mock('../hooks/useVitalsData', () => ({
  useVitalsData: vi.fn(() => ({
    revenue: 12, revenueGoal: 36, daysAlive: 47,
    survivalPercent: 33, aiState: 'idle',
  })),
}));

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false), // desktop by default
}));

vi.mock('../components/shared/BreathingBackground', () => ({
  BreathingBackground: () => <div data-testid="breathing-bg" />,
}));

vi.mock('../components/canvas/live2d', () => ({
  Live2D: () => <div data-testid="live2d" />,
}));

vi.mock('../components/vitals/VitalsBar', () => ({
  VitalsBar: () => <div data-testid="vitals-bar" />,
}));

vi.mock('../components/dialogue/BrandEntrance', () => ({
  BrandEntrance: ({ onComplete }: { onComplete: () => void }) => {
    // Auto-complete immediately for tests
    React.useEffect(() => { onComplete(); }, [onComplete]);
    return null;
  },
}));

vi.mock('../components/dialogue/DialogueSpace', () => ({
  DialogueSpace: () => <div data-testid="dialogue-space" />,
}));

vi.mock('../components/dialogue/SpatialInput', () => ({
  SpatialInput: () => <div data-testid="spatial-input" />,
}));

vi.mock('../components/dialogue/MobileAvatar', () => ({
  MobileAvatar: () => <div data-testid="mobile-avatar" />,
}));

vi.mock('../components/landing/LingSilhouette', () => ({
  LingSilhouette: () => <div data-testid="ling-silhouette" />,
}));

vi.mock('../context/ChatHistoryContext', () => ({
  useChatMessagesState: vi.fn(() => ({ messages: [] })),
  useStreamingValue: vi.fn(() => ({ fullResponse: '' })),
}));

vi.mock('../context/AiStateContext', () => ({
  useAiState: vi.fn(() => ({ aiState: 'idle' })),
}));

vi.mock('../data/ling-greetings', () => ({
  getLingGreeting: () => 'Hello.',
}));

import { useMediaQuery } from '../hooks/useMediaQuery';
import { SpatialLayout } from '../components/dialogue/SpatialLayout';

const cssPath = path.resolve(__dirname, '../components/dialogue/SpatialLayout.module.css');
const css = fs.readFileSync(cssPath, 'utf-8');

describe('SpatialLayout', () => {
  it('renders BreathingBackground', () => {
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('breathing-bg')).toBeTruthy();
  });

  it('renders VitalsBar', () => {
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('vitals-bar')).toBeTruthy();
  });

  it('desktop renders Live2D', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false); // desktop
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('live2d')).toBeTruthy();
  });

  it('renders DialogueSpace', () => {
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('dialogue-space')).toBeTruthy();
  });

  it('renders SpatialInput', () => {
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('spatial-input')).toBeTruthy();
  });

  it('mobile renders MobileAvatar', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true); // mobile
    const { getByTestId } = render(<SpatialLayout />);
    expect(getByTestId('mobile-avatar')).toBeTruthy();
  });

  it('mobile does not render Live2D character container', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const { queryByTestId } = render(<SpatialLayout />);
    expect(queryByTestId('live2d')).toBeNull();
  });

  it('(static) CSS has mobile 768px breakpoint', () => {
    expect(css).toContain('max-width: 768px');
  });
});
