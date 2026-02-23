import { useRef } from 'react';

/**
 * Returns a ref that always holds the latest value.
 *
 * Replaces the common "ref mirror" pattern:
 *   const fooRef = useRef(foo);
 *   fooRef.current = foo;
 *
 * With a single line:
 *   const fooRef = useLatest(foo);
 *
 * Useful for keeping the latest callback / state available inside
 * stable useEffect / useCallback closures without adding them to
 * the dependency array (which would tear down and re-subscribe).
 */
export function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
