import { memo, lazy, Suspense } from 'react';
import styles from './SpatialMessage.module.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

interface SpatialMessageProps {
  role: 'ai' | 'human';
  content: string;
  fadeTier: 1 | 2 | 3 | 4;
  gapTier: 'near' | 'mid' | 'far';
  animate?: boolean;
  isStreaming?: boolean;
  isOld?: boolean;
  hasMemoryRef?: boolean;
  hasSuggestion?: boolean;
  timestamp?: string;
  onSuggestionClick?: () => void;
  onShareClick?: () => void;
}

export const SpatialMessage = memo(function SpatialMessage({
  role,
  content,
  fadeTier,
  gapTier,
  animate = false,
  isStreaming = false,
  isOld = false,
  hasMemoryRef = false,
  hasSuggestion = false,
  timestamp,
  onSuggestionClick,
}: SpatialMessageProps) {
  const voice = role === 'ai' ? 'ling' : 'world';
  const isLong = content.length >= 80;

  return (
    <div
      className={`${styles.message} ${isLong && role === 'ai' ? styles.longMsg : ''}`}
      data-voice={voice}
      data-fade={fadeTier}
      data-gap={gapTier}
      data-animate={animate ? 'true' : undefined}
      data-old={isOld ? 'true' : undefined}
    >
      {role === 'ai' ? (
        <Suspense fallback={<p>{content}</p>}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </Suspense>
      ) : (
        <p>{content}</p>
      )}

      {isStreaming && <span className={styles.cursor} aria-hidden="true" />}

      {hasMemoryRef && (
        <div className={styles.sparkleContainer} aria-hidden="true">
          <span className={styles.sparkle} />
          <span className={styles.sparkle} />
          <span className={styles.sparkle} />
          <span className={styles.sparkle} />
        </div>
      )}

      {hasSuggestion && onSuggestionClick && (
        <button className={styles.suggestion} onClick={onSuggestionClick}>
          I have a suggestion →
        </button>
      )}

      {timestamp && (
        <time className={styles.timestamp}>{timestamp}</time>
      )}
    </div>
  );
});
