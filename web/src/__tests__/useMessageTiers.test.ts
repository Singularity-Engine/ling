import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageTiers, MESSAGE_LIMIT } from '../hooks/dialogue/useMessageTiers';

interface MockMessage {
  id: string;
  role: 'human' | 'ai';
  content: string;
  [key: string]: unknown;
}

function makeMsgs(count: number): MockMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? ('human' as const) : ('ai' as const),
    content: `Message ${i}`,
  }));
}

describe('useMessageTiers', () => {
  it('returns array length ≤ MESSAGE_LIMIT (20)', () => {
    const msgs = makeMsgs(30);
    const { result } = renderHook(() => useMessageTiers(msgs));
    expect(result.current.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(result.current.length).toBe(MESSAGE_LIMIT);
  });

  it('latest message has fadeTier=1', () => {
    const msgs = makeMsgs(5);
    const { result } = renderHook(() => useMessageTiers(msgs));
    const last = result.current[result.current.length - 1];
    expect(last.fadeTier).toBe(1);
  });

  it('older messages have higher fadeTier', () => {
    const msgs = makeMsgs(12);
    const { result } = renderHook(() => useMessageTiers(msgs));
    // First message should have higher fadeTier than last
    const first = result.current[0];
    const last = result.current[result.current.length - 1];
    expect(first.fadeTier).toBeGreaterThanOrEqual(last.fadeTier);
  });

  it('deterministic sparkle: every 7th assistant message at position 5', () => {
    // Create enough assistant messages to trigger sparkle
    const msgs: MockMessage[] = [];
    for (let i = 0; i < 20; i++) {
      msgs.push({ id: `u${i}`, role: 'human', content: `Q${i}` });
      msgs.push({ id: `a${i}`, role: 'ai', content: `A${i}` });
    }
    const { result } = renderHook(() => useMessageTiers(msgs));
    const sparkled = result.current.filter((m) => m.hasMemoryRef);
    // Should have at least one sparkle in 20 assistant messages
    expect(sparkled.length).toBeGreaterThan(0);
  });

  it('suggestion keywords trigger hasSuggestion', () => {
    const msgs: MockMessage[] = [
      { id: 'u1', role: 'human', content: 'Hello' },
      { id: 'a1', role: 'ai', content: 'I am considering a new approach to this problem...' },
    ];
    const { result } = renderHook(() => useMessageTiers(msgs));
    const assistant = result.current.find((m) => m.role === 'ai');
    expect(assistant?.hasSuggestion).toBe(true);
  });

  it('P0-H: passing 30 messages returns only 20', () => {
    const msgs = makeMsgs(30);
    const { result } = renderHook(() => useMessageTiers(msgs));
    expect(result.current.length).toBe(20);
  });

  it('P1-G: hasMemoryRef and hasSuggestion are mutually exclusive', () => {
    const msgs: MockMessage[] = [];
    for (let i = 0; i < 40; i++) {
      msgs.push({ id: `u${i}`, role: 'human', content: `Q${i}` });
      msgs.push({
        id: `a${i}`,
        role: 'ai',
        content: `I am considering something for Q${i}`,
      });
    }
    const { result } = renderHook(() => useMessageTiers(msgs));
    const conflicts = result.current.filter((m) => m.hasMemoryRef && m.hasSuggestion);
    expect(conflicts.length).toBe(0);
  });
});
