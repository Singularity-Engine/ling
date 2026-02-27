import { useState, useEffect } from 'react';

export function useDeepThinking(aiState: string): boolean {
  const [deep, setDeep] = useState(false);

  useEffect(() => {
    if (aiState !== 'thinking-speaking' && aiState !== 'loading') {
      setDeep(false);
      return;
    }
    const timer = setTimeout(() => setDeep(true), 2000);
    return () => clearTimeout(timer);
  }, [aiState]);

  return deep;
}
