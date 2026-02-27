import { useRef, useState, useEffect } from 'react';

interface UseInViewportOptions {
  threshold?: number;
  once?: boolean;
  rootMargin?: string;
}

export function useInViewport<T extends HTMLElement>(
  options: UseInViewportOptions = {},
) {
  const { threshold = 0.3, once = true, rootMargin = '0px' } = options;
  const ref = useRef<T>(null);
  const [inViewport, setInViewport] = useState(
    typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInViewport(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInViewport(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, inViewport };
}
