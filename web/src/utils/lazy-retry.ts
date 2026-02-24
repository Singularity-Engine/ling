import { lazy, type ComponentType } from "react";
import { createLogger } from "./logger";

const log = createLogger("LazyRetry");

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/**
 * Retry a dynamic `import()` with exponential back-off.
 *
 * Handles transient chunk-load failures (network blip, CDN edge purge,
 * deploy-time hash mismatch) that would otherwise leave the component
 * permanently broken until a full page refresh — because React.lazy
 * caches the first rejection and never re-invokes the factory.
 */
function retryDynamicImport<T>(
  factory: () => Promise<T>,
  retries: number,
  attempt = 1,
): Promise<T> {
  return factory().catch((err: unknown) => {
    if (retries <= 0) throw err;

    const delay = BASE_DELAY_MS * 2 ** (attempt - 1); // 1.5s → 3s → 6s
    log.warn(`Chunk load failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms…`, err);

    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        retryDynamicImport(factory, retries - 1, attempt + 1).then(resolve, reject);
      }, delay);
    });
  });
}

/**
 * Drop-in replacement for `React.lazy` that retries the dynamic import
 * up to 3 times with exponential back-off before giving up.
 *
 * ```ts
 * // Before
 * const Foo = lazy(() => import("./Foo"));
 *
 * // After
 * const Foo = lazyRetry(() => import("./Foo"));
 * ```
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() => retryDynamicImport(factory, MAX_RETRIES));
}
