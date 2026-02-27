/**
 * Lightweight tagged logger.
 *
 * - `debug` / `info`  → only fire in dev (Vite tree-shakes the dead branch in prod)
 * - `warn`  / `error`  → always fire
 *
 * Usage:
 *   const log = createLogger('GatewayConnector');
 *   log.debug('WebSocket open');          // dev only
 *   log.error('Connection failed:', err); // always
 */

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;

  return {
    debug: import.meta.env.DEV
      ? (...args: unknown[]) => console.log(prefix, ...args)
      : noop,
    info: import.meta.env.DEV
      ? (...args: unknown[]) => console.info(prefix, ...args)
      : noop,
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
