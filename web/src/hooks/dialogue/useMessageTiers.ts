import { useMemo } from 'react';

export const MESSAGE_LIMIT = 20;

const SUGGESTION_KEYWORDS = ['deciding', 'considering', 'thinking about', 'wondering whether', 'should I'];

interface Message {
  id?: string;
  role: 'ai' | 'human';
  content: string;
}

export interface TieredMessage extends Message {
  index: number;
  fadeTier: 1 | 2 | 3 | 4;
  gapTier: 'near' | 'mid' | 'far';
  isOld: boolean;
  hasMemoryRef: boolean;
  hasSuggestion: boolean;
}

export function useMessageTiers(messages: Message[]): TieredMessage[] {
  return useMemo(() => {
    const visible = messages.slice(-MESSAGE_LIMIT);

    return visible.map((msg, index) => {
      const total = visible.length;
      const fromEnd = total - 1 - index;
      const role = msg.role;
      const content = (msg.content || '') as string;

      // Fade tier
      const fadeTier: 1 | 2 | 3 | 4 = fromEnd < 5 ? 1 : fromEnd < 8 ? 2 : fromEnd < 12 ? 3 : 4;

      // Gap tier
      const gapTier: 'near' | 'mid' | 'far' = fromEnd < 3 ? 'near' : fromEnd < 8 ? 'mid' : 'far';

      // Old message
      const isOld = fromEnd >= 8;

      // Memory sparkle — deterministic interval (every 7th assistant msg, position 5)
      const assistantCount = visible.filter((m, i) => i <= index && m.role === 'ai').length;
      const hasMemoryRefRaw = role === 'ai' && assistantCount % 7 === 5;

      // Suggestion — keyword detection
      const hasSuggestionRaw = role === 'ai'
        && SUGGESTION_KEYWORDS.some(kw => content.toLowerCase().includes(kw));

      // P1-G: mutual exclusion — sparkle and suggestion don't show simultaneously
      const hasMemoryRef = hasMemoryRefRaw && !hasSuggestionRaw;
      const hasSuggestion = hasSuggestionRaw;

      return {
        ...msg,
        index,
        fadeTier,
        gapTier,
        isOld,
        hasMemoryRef,
        hasSuggestion,
      };
    });
  }, [messages]);
}
