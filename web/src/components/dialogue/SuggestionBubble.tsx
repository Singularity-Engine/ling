import { memo, useState, useRef } from 'react';
import styles from './SuggestionBubble.module.css';

interface SuggestionBubbleProps {
  visible: boolean;
  onSubmit: (text: string) => void;
}

export const SuggestionBubble = memo(function SuggestionBubble({
  visible,
  onSubmit,
}: SuggestionBubbleProps) {
  const [state, setState] = useState<'trigger' | 'input' | 'confirmed'>('trigger');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!visible) return null;

  const handleTriggerClick = () => {
    setState('input');
    // Focus input after render
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    onSubmit(text);
    setState('confirmed');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  if (state === 'confirmed') {
    return <span className={styles.confirmation}>Suggestion noted ✓</span>;
  }

  if (state === 'input') {
    return (
      <div className={styles.inputWrap}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Your suggestion..."
          onKeyDown={handleKeyDown}
          aria-label="Type your suggestion"
        />
        <button className={styles.sendBtn} onClick={handleSend}>
          Send
        </button>
      </div>
    );
  }

  return (
    <button className={styles.trigger} onClick={handleTriggerClick}>
      I have a suggestion
    </button>
  );
});
