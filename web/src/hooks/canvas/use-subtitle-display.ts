import { useMemo } from 'react';
import { useSubtitle } from '@/context/SubtitleContext';

export const useSubtitleDisplay = () => {
  const context = useSubtitle();

  const subtitleText = useMemo(() => {
    if (!context) return null;
    return context.subtitleText;
  }, [context?.subtitleText]);

  return {
    subtitleText,
    isLoaded: !!context,
  };
};
