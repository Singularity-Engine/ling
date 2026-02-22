/**
 * Utility for injecting CSS styles into the document head.
 * Prevents duplicate injections and handles SSR compatibility.
 */

interface StyleInjectionOptions {
  /** Unique identifier for the style element */
  id?: string;
  /** Custom attribute to set on the style element */
  attribute?: string;
  /** CSS content to inject */
  css: string;
}

// Global registry to track injected styles and prevent duplicates
const _injectedStyles = new Set<string>();

/**
 * Ensures a CSS style block is injected into the document head exactly once.
 * Safe for SSR and handles edge cases like document unavailability.
 *
 * @param options - Style injection configuration
 * @returns true if styles were injected, false if already present or unavailable
 */
export function ensureStylesInjected(options: StyleInjectionOptions): boolean {
  const { id, attribute, css } = options;

  // Skip injection in SSR or when document is unavailable
  if (typeof document === 'undefined') return false;

  // Create a unique key for tracking this style injection
  const trackingKey = id || attribute || css.slice(0, 50);

  // Skip if already injected
  if (_injectedStyles.has(trackingKey)) return false;

  // Skip if element with same ID already exists
  if (id && document.getElementById(id)) {
    _injectedStyles.add(trackingKey);
    return false;
  }

  // Create and inject the style element
  const styleElement = document.createElement('style');

  if (id) {
    styleElement.id = id;
  }

  if (attribute) {
    styleElement.setAttribute(attribute, '');
  }

  styleElement.textContent = css;
  document.head.appendChild(styleElement);

  // Track as injected
  _injectedStyles.add(trackingKey);

  return true;
}

/**
 * Creates a memoized style injection function for a specific style block.
 * Useful for component-level style injection with useEffect.
 *
 * @param options - Style injection configuration
 * @returns A function that can be called multiple times safely
 */
export function createStyleInjector(options: StyleInjectionOptions) {
  return () => ensureStylesInjected(options);
}