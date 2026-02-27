import { memo, useRef } from 'react';
import { SpatialMessage } from './SpatialMessage';
import { ThinkingGlow } from './ThinkingGlow';
import { useMessageTiers } from '@/hooks/dialogue/useMessageTiers';
import { useDeepThinking } from '@/hooks/dialogue/useDeepThinking';
import { useAutoScroll } from '@/hooks/dialogue/useAutoScroll';
import { getLingGreeting } from '@/data/ling-greetings';
import { useChatMessagesState } from '@/context/ChatHistoryContext';
import { useStreamingValue } from '@/context/ChatHistoryContext';
import { useAiState } from '@/context/AiStateContext';
import styles from './DialogueSpace.module.css';

export const DialogueSpace = memo(function DialogueSpace() {
  const spaceRef = useRef<HTMLDivElement>(null);
  const { messages } = useChatMessagesState();
  const { fullResponse } = useStreamingValue();
  const { aiState } = useAiState();

  const isThinking = aiState === 'thinking-speaking' || aiState === 'loading';
  const deepThinking = useDeepThinking(aiState);
  const tieredMessages = useMessageTiers(messages);

  useAutoScroll(spaceRef, [messages.length]);

  // Empty state — Ling's greeting
  if (messages.length === 0) {
    const greeting = getLingGreeting();
    return (
      <div ref={spaceRef} className={styles.space} role="log" aria-live="polite">
        <ThinkingGlow active={false} />
        <div className={styles.greeting}>
          <SpatialMessage
            role="ai"
            content={greeting}
            fadeTier={1}
            gapTier="near"
            animate
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={spaceRef} className={styles.space} role="log" aria-live="polite">
      <ThinkingGlow active={isThinking} deepThinking={deepThinking} />
      {tieredMessages.map((msg, i) => {
        const isLast = i === tieredMessages.length - 1;
        const isStreamingMsg = isLast && msg.role === 'ai' && fullResponse;

        return (
          <SpatialMessage
            key={msg.id || i}
            role={msg.role}
            content={isStreamingMsg ? fullResponse : msg.content}
            fadeTier={msg.fadeTier}
            gapTier={msg.gapTier}
            isOld={msg.isOld}
            hasMemoryRef={msg.hasMemoryRef}
            hasSuggestion={msg.hasSuggestion}
            isStreaming={!!isStreamingMsg}
            animate={isLast}
          />
        );
      })}
    </div>
  );
});
