import { useState, useCallback } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('LocalStorage');

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    filter?: (value: T) => T
  },
) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      const parsedValue = item ? JSON.parse(item) : initialValue;
      return parsedValue;
    } catch (error) {
      log.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // useCallback ensures a stable reference; functional setStoredValue
  // avoids stale-closure reads of `storedValue`.
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue(prev => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        const filteredValue = options?.filter ? options.filter(valueToStore) : valueToStore;
        window.localStorage.setItem(key, JSON.stringify(filteredValue));
        return valueToStore;
      });
    } catch (error) {
      log.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, options]);

  return [storedValue, setValue] as const;
}
