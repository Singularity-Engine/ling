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

// ── Pre-parsed combo representation ──
// Parsed once per unique combo string, cached for all subsequent keydown
// matches. Eliminates string.split() + Set allocation + navigator.platform
// string ops on every keydown event (7 shortcuts × every keystroke).

interface ParsedCombo {
  key: string;
  wantCtrl: boolean;
  wantMeta: boolean;
  needShift: boolean;
  needAlt: boolean;
}

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const _comboCache = new Map<string, ParsedCombo>();

function parseCombo(raw: string): ParsedCombo {
  let p = _comboCache.get(raw);
  if (p) return p;

  const parts = raw.toLowerCase().split("+");
  const key = parts.pop()!;
  const hasCtrl = parts.includes("ctrl");
  const hasMeta = parts.includes("meta");
  const hasMod = parts.includes("mod");

  p = {
    key,
    wantCtrl: hasCtrl || (!IS_MAC && hasMod),
    wantMeta: hasMeta || (IS_MAC && hasMod),
    needShift: parts.includes("shift"),
    needAlt: parts.includes("alt"),
  };
  _comboCache.set(raw, p);
  return p;
}

/**
 * Tests whether a KeyboardEvent matches a combo string.
 * All string operations have been moved to parseCombo() (cached) —
 * this function does pure boolean comparisons only.
 */
function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const { key, wantCtrl, wantMeta, needShift, needAlt } = parseCombo(combo);

  if (wantCtrl !== e.ctrlKey) return false;
  if (wantMeta !== e.metaKey) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

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
