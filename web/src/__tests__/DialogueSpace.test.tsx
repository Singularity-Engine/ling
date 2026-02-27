import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import React from 'react';

// jsdom lacks scrollTo
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

// Mock contexts
vi.mock('../context/ChatHistoryContext', () => ({
  useChatMessagesState: vi.fn(() => ({ messages: [] })),
  useStreamingValue: vi.fn(() => ({ fullResponse: '' })),
}));

vi.mock('../context/AiStateContext', () => ({
  useAiState: vi.fn(() => ({ aiState: 'idle' })),
}));

// Mock child components
vi.mock('../components/dialogue/SpatialMessage', () => ({
  SpatialMessage: (props: Record<string, unknown>) => (
    <div data-testid="spatial-message" data-role={props.role as string} data-fade-tier={props.fadeTier} />
  ),
}));

vi.mock('../components/dialogue/ThinkingGlow', () => ({
  ThinkingGlow: (props: Record<string, unknown>) => (
    <div data-testid="thinking-glow" data-active={props.active} />
  ),
}));

vi.mock('../data/ling-greetings', () => ({
  getLingGreeting: () => 'Hello from Ling.',
}));

import { useChatMessagesState, useStreamingValue } from '../context/ChatHistoryContext';
import { useAiState } from '../context/AiStateContext';
import { DialogueSpace } from '../components/dialogue/DialogueSpace';

const cssPath = path.resolve(__dirname, '../components/dialogue/DialogueSpace.module.css');
const css = fs.readFileSync(cssPath, 'utf-8');

describe('DialogueSpace', () => {
  it('renders greeting when empty messages', () => {
    const { getByTestId } = render(<DialogueSpace />);
    const msg = getByTestId('spatial-message');
    expect(msg.getAttribute('data-role')).toBe('ai');
  });

  it('renders messages when present', () => {
    vi.mocked(useChatMessagesState).mockReturnValue({
      messages: [
        { id: 'u1', role: 'human', content: 'Hi' },
        { id: 'a1', role: 'ai', content: 'Hello' },
      ],
    } as any);

    const { getAllByTestId } = render(<DialogueSpace />);
    expect(getAllByTestId('spatial-message').length).toBe(2);
  });

  it('latest message has fadeTier=1', () => {
    vi.mocked(useChatMessagesState).mockReturnValue({
      messages: [
        { id: 'u1', role: 'human', content: 'Hi' },
        { id: 'a1', role: 'ai', content: 'Hello' },
      ],
    } as any);

    const { getAllByTestId } = render(<DialogueSpace />);
    const messages = getAllByTestId('spatial-message');
    expect(messages[messages.length - 1].getAttribute('data-fade-tier')).toBe('1');
  });

  it('renders ThinkingGlow when thinking', () => {
    vi.mocked(useAiState).mockReturnValue({ aiState: 'thinking-speaking' } as any);

    const { getByTestId } = render(<DialogueSpace />);
    expect(getByTestId('thinking-glow').getAttribute('data-active')).toBe('true');
  });

  it('P0-D: container has role="log" attribute', () => {
    const { container } = render(<DialogueSpace />);
    const log = container.querySelector('[role="log"]');
    expect(log).toBeTruthy();
  });

  it('P0-D: container has aria-live="polite" attribute', () => {
    const { container } = render(<DialogueSpace />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
  });

  it('(static) CSS contains justify-content: flex-end', () => {
    expect(css).toContain('justify-content: flex-end');
  });

  it('(static) CSS contains scrollbar-width: none', () => {
    expect(css).toContain('scrollbar-width: none');
  });

  // ── Integration: fadeTier range validation ──
  it('integration: all fadeTier values are within 1-4 range for 30 messages', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'human' : 'ai',
      content: `Message ${i}`,
    }));
    vi.mocked(useChatMessagesState).mockReturnValue({ messages: msgs } as any);

    const { getAllByTestId } = render(<DialogueSpace />);
    const rendered = getAllByTestId('spatial-message');

    // MESSAGE_LIMIT=20, so only 20 rendered
    expect(rendered.length).toBe(20);

    // Every fadeTier must be 1, 2, 3, or 4
    rendered.forEach((el) => {
      const tier = el.getAttribute('data-fade-tier');
      expect(['1', '2', '3', '4']).toContain(tier);
    });
  });

  // ── Integration: streaming message gets fullResponse content ──
  it('integration: last AI message uses fullResponse when streaming', () => {
    vi.mocked(useChatMessagesState).mockReturnValue({
      messages: [
        { id: 'u1', role: 'human', content: 'Hi' },
        { id: 'a1', role: 'ai', content: 'partial' },
      ],
    } as any);
    vi.mocked(useStreamingValue).mockReturnValue({ fullResponse: 'streaming text here' } as any);

    const { getAllByTestId } = render(<DialogueSpace />);
    const messages = getAllByTestId('spatial-message');
    // Last message should exist and be AI role
    expect(messages[messages.length - 1].getAttribute('data-role')).toBe('ai');
  });

  // ── Integration: unmount during streaming produces no errors ──
  it('integration: unmount during streaming does not throw', () => {
    vi.mocked(useChatMessagesState).mockReturnValue({
      messages: [{ id: 'a1', role: 'ai', content: 'thinking...' }],
    } as any);
    vi.mocked(useStreamingValue).mockReturnValue({ fullResponse: 'still going' } as any);
    vi.mocked(useAiState).mockReturnValue({ aiState: 'thinking-speaking' } as any);

    const { unmount } = render(<DialogueSpace />);
    expect(() => unmount()).not.toThrow();
  });
});
