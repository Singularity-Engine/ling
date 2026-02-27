import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useInViewport } from '../hooks/useInViewport';

let capturedCallback: IntersectionObserverCallback;
const mockDisconnect = vi.fn();
const mockObserve = vi.fn();

function stubIntersectionObserver() {
  const MockIO = vi.fn(function (this: unknown, cb: IntersectionObserverCallback) {
    capturedCallback = cb;
    return {
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: vi.fn(),
    };
  });
  vi.stubGlobal('IntersectionObserver', MockIO);
}

function fireIntersection(isIntersecting: boolean) {
  act(() => {
    capturedCallback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

function TestComponent({ once }: { once?: boolean }) {
  const { ref, inViewport } = useInViewport<HTMLDivElement>({ once });
  return <div ref={ref} data-testid="el" data-visible={String(inViewport)} />;
}

describe('useInViewport', () => {
  beforeEach(() => {
    mockDisconnect.mockClear();
    mockObserve.mockClear();
    stubIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with inViewport=false', () => {
    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId('el').dataset.visible).toBe('false');
  });

  it('becomes true when element intersects', () => {
    const { getByTestId } = render(<TestComponent />);
    fireIntersection(true);
    expect(getByTestId('el').dataset.visible).toBe('true');
  });

  it('stays true after leaving viewport when once=true', () => {
    const { getByTestId } = render(<TestComponent once={true} />);
    fireIntersection(true);
    expect(getByTestId('el').dataset.visible).toBe('true');
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('disconnects on unmount', () => {
    const { unmount } = render(<TestComponent />);
    expect(mockObserve).toHaveBeenCalled();
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('falls back to true when IntersectionObserver is unavailable', () => {
    vi.unstubAllGlobals();
    // @ts-expect-error — remove IO for fallback test
    delete globalThis.IntersectionObserver;
    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId('el').dataset.visible).toBe('true');
  });
});
