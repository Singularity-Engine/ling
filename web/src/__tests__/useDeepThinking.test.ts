import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeepThinking } from '../hooks/dialogue/useDeepThinking';

describe('useDeepThinking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when idle', () => {
    const { result } = renderHook(() => useDeepThinking('idle'));
    expect(result.current).toBe(false);
  });

  it('returns false initially when thinking-speaking', () => {
    const { result } = renderHook(() => useDeepThinking('thinking-speaking'));
    expect(result.current).toBe(false);
  });

  it('returns true after >2s of thinking-speaking', () => {
    const { result } = renderHook(() => useDeepThinking('thinking-speaking'));

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current).toBe(true);
  });

  it('returns true after >2s of loading', () => {
    const { result } = renderHook(() => useDeepThinking('loading'));

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current).toBe(true);
  });

  it('resets to false when switching back to idle', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useDeepThinking(state),
      { initialProps: { state: 'thinking-speaking' as string } },
    );

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(result.current).toBe(true);

    rerender({ state: 'idle' });
    expect(result.current).toBe(false);
  });

  it('clears timer on unmount without errors', () => {
    const { unmount } = renderHook(() => useDeepThinking('thinking-speaking'));
    unmount();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
  });
});
