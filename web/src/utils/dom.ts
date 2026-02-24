/** Shared DOM selectors — avoids magic-string duplication across components. */

const TEXTAREA_SELECTOR = '.ling-textarea';

/**
 * Focus the main chat textarea.
 * No-ops silently if the element isn't mounted (e.g. overlay mode).
 */
export function focusTextarea(): void {
  (document.querySelector<HTMLElement>(TEXTAREA_SELECTOR))?.focus();
}
