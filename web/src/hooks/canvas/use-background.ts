import { useMemo } from 'react';
import { useBgUrl } from '@/context/BgurlContext';

export const useBackground = () => {
  const context = useBgUrl();

  const backgroundUrl = useMemo(() => {
    if (!context) return null;
    return context.backgroundUrl;
  }, [context?.backgroundUrl]);

  return {
    backgroundUrl,
    isLoaded: !!context,
  };
};
