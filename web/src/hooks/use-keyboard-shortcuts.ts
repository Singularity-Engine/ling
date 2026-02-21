import { useEffect, useCallback, useRef } from "react";

export interface ShortcutDef {
  /** Key combo like "ctrl+/" or "shift+?" */
  key: string;
  /** i18n key for the label */
  labelKey: string;
  /** Action to execute. Return false to let the event propagate (not handled). */
  action: () => void | false;
  /** Whether this shortcut should work when an input/textarea is focused */
  allowInInput?: boolean;
}

/**
 * Parses a key combo string like "ctrl+/" into a matcher.
 * Supports: ctrl, meta (cmd), shift, alt + a single key.
 * "mod" maps to meta on Mac, ctrl on others.
 */
function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop()!;
  const mods = new Set(parts);

  const isMac = navigator.platform.toUpperCase().includes("MAC");

  const needCtrl = mods.has("ctrl");
  const needMeta = mods.has("meta");
  const needMod = mods.has("mod");
  const needShift = mods.has("shift");
  const needAlt = mods.has("alt");

  const wantCtrl = needCtrl || (!isMac && needMod);
  const wantMeta = needMeta || (isMac && needMod);

  if (wantCtrl !== e.ctrlKey) return false;
  if (wantMeta !== e.metaKey) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  // Match the key itself
  const eventKey = e.key.toLowerCase();
  if (key === "?") return eventKey === "?";
  if (key === "/") return eventKey === "/" || e.code === "Slash";
  if (key === "escape") return eventKey === "escape";
  return eventKey === key;
}

/**
 * Hook that registers global keyboard shortcuts.
 * Shortcuts are ignored when typing in inputs unless allowInInput is set.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    for (const shortcut of shortcutsRef.current) {
      if (isInput && !shortcut.allowInInput) continue;
      if (matchesCombo(e, shortcut.key)) {
        const result = shortcut.action();
        if (result !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);
}
