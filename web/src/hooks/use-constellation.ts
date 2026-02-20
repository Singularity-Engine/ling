import { create } from "zustand";
import { getSkillKey } from "../config/skill-registry";

export interface DiscoveredSkill {
  key: string;
  count: number;
  lastUsed: number;
  firstSeen: number;
  seed?: boolean;
}

interface ConstellationState {
  discovered: DiscoveredSkill[];
  isNew: boolean;
  newSkillKey: string | null;

  recordSkillUse: (toolName: string) => void;
  seedSkills: (keys: string[]) => void;
  getTopSkills: (n: number) => DiscoveredSkill[];
  clearNewFlag: () => void;
}

const STORAGE_KEY = "ling-constellation-v1";

function loadFromStorage(): DiscoveredSkill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveToStorage(discovered: DiscoveredSkill[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(discovered));
  } catch { /* ignore */ }
}

export const useConstellation = create<ConstellationState>((set, get) => ({
  discovered: loadFromStorage(),
  isNew: false,
  newSkillKey: null,

  recordSkillUse: (toolName: string) => {
    const key = getSkillKey(toolName);
    if (key === 'unknown') return;

    const now = Date.now();
    const { discovered } = get();
    const existing = discovered.find(s => s.key === key);

    let next: DiscoveredSkill[];
    let isNewSkill = false;

    if (existing) {
      next = discovered.map(s =>
        s.key === key
          ? { ...s, count: s.count + 1, lastUsed: now, seed: false }
          : s
      );
    } else {
      isNewSkill = true;
      next = [...discovered, { key, count: 1, lastUsed: now, firstSeen: now }];
    }

    saveToStorage(next);
    set({
      discovered: next,
      isNew: isNewSkill,
      newSkillKey: isNewSkill ? key : null,
    });

    // Auto-clear new flag after animation duration
    if (isNewSkill) {
      setTimeout(() => {
        set(state => state.newSkillKey === key ? { isNew: false, newSkillKey: null } : {});
      }, 2000);
    }
  },

  seedSkills: (keys: string[]) => {
    const { discovered } = get();
    const now = Date.now();
    const existingKeys = new Set(discovered.map(s => s.key));
    const newSeeds = keys
      .filter(k => !existingKeys.has(k))
      .map(k => ({ key: k, count: 0, lastUsed: now, firstSeen: now, seed: true }));
    if (newSeeds.length === 0) return;
    const next = [...discovered, ...newSeeds];
    saveToStorage(next);
    set({ discovered: next });
  },

  getTopSkills: (n: number) => {
    const { discovered } = get();
    return [...discovered].sort((a, b) => b.count - a.count).slice(0, n);
  },

  clearNewFlag: () => {
    set({ isNew: false, newSkillKey: null });
  },
}));

// Listen for CustomEvent from websocket-handler
if (typeof window !== 'undefined') {
  window.addEventListener('constellation-skill-used', ((e: CustomEvent) => {
    if (e.detail?.toolName) {
      useConstellation.getState().recordSkillUse(e.detail.toolName);
    }
  }) as EventListener);
}
