import { describe, it, expect } from 'vitest';
import { getCuratedActions, ACTION_ICONS, type ActionType } from '../data/sngxai-actions';

describe('sngxai-actions (curated data)', () => {
  const actions = getCuratedActions();

  it('returns non-empty array', () => {
    expect(actions.length).toBeGreaterThan(0);
  });

  it('every card has id, type, quote, relativeTime', () => {
    for (const card of actions) {
      expect(card.id).toBeTruthy();
      expect(card.type).toBeTruthy();
      expect(card.quote).toBeTruthy();
      expect(card.relativeTime).toBeTruthy();
    }
  });

  it('has cards from both decisions and feed sources', () => {
    const types = new Set(actions.map((a) => a.type));
    // Decisions map to DECISION or SIGNAL_DECISION
    const hasDecisionType = types.has('DECISION') || types.has('SIGNAL_DECISION');
    // Feed posts map to CONTENT or REFLECTION
    const hasFeedType = types.has('CONTENT') || types.has('REFLECTION');
    expect(hasDecisionType).toBe(true);
    expect(hasFeedType).toBe(true);
  });

  it('SIGNAL_DECISION cards have signal field', () => {
    const signalCards = actions.filter((a) => a.type === 'SIGNAL_DECISION');
    for (const card of signalCards) {
      expect(card.signal).toBeTruthy();
    }
  });

  it('ACTION_ICONS covers all 4 types', () => {
    const types: ActionType[] = ['DECISION', 'CONTENT', 'REFLECTION', 'SIGNAL_DECISION'];
    for (const t of types) {
      expect(ACTION_ICONS[t]).toBeTruthy();
    }
  });

  it('all ids are unique', () => {
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DECISION and CONTENT cards have actionLabel', () => {
    const relevant = actions.filter((a) => a.type === 'DECISION' || a.type === 'CONTENT');
    for (const card of relevant) {
      expect(card.actionLabel).toBeTruthy();
    }
  });

  it('cards have correct optional fields per type', () => {
    for (const card of actions) {
      if (card.type === 'SIGNAL_DECISION') {
        expect(card.signal).toBeTruthy();
      }
      if (card.type === 'DECISION' || card.type === 'SIGNAL_DECISION') {
        expect(card.context).toBeTruthy();
      }
    }
  });
});
