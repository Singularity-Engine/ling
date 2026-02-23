import {
  createContext, useContext, useState, useMemo, useEffect, useCallback,
} from 'react';

/**
 * Character configuration file interface
 */
export interface ConfigFile {
  filename: string;
  name: string;
}

/**
 * Read-only character config state.
 * Changes when confName, confUid, or configFiles update.
 */
interface ConfigState {
  confName: string;
  confUid: string;
  configFiles: ConfigFile[];
  getFilenameByName: (name: string) => string | undefined;
}

/**
 * Stable action callbacks.
 * All callbacks are useState setters (intrinsically stable), so this
 * context value never changes after mount.
 */
interface ConfigActions {
  setConfName: (name: string) => void;
  setConfUid: (uid: string) => void;
  setConfigFiles: (files: ConfigFile[]) => void;
}

const ConfigStateContext = createContext<ConfigState | null>(null);
const ConfigActionsContext = createContext<ConfigActions | null>(null);

/**
 * Default values
 */
const DEFAULT_CONFIG = {
  confName: '',
  confUid: '',
  configFiles: [] as ConfigFile[],
};

/**
 * Character Configuration Provider Component
 */
export function CharacterConfigProvider({ children }: { children: React.ReactNode }) {
  const [confName, setConfName] = useState<string>(DEFAULT_CONFIG.confName);
  const [confUid, setConfUid] = useState<string>(DEFAULT_CONFIG.confUid);
  const [configFiles, setConfigFiles] = useState<ConfigFile[]>(DEFAULT_CONFIG.configFiles);

  const getFilenameByName = useCallback(
    (name: string) => configFiles.find((config) => config.name === name)?.filename,
    [configFiles],
  );

  const state = useMemo<ConfigState>(
    () => ({ confName, confUid, configFiles, getFilenameByName }),
    [confName, confUid, configFiles, getFilenameByName],
  );

  const actions = useMemo<ConfigActions>(
    () => ({ setConfName, setConfUid, setConfigFiles }),
    [],
  );

  useEffect(() => {
    window.api?.updateConfigFiles?.(configFiles);
  }, [configFiles]);

  return (
    <ConfigActionsContext.Provider value={actions}>
      <ConfigStateContext.Provider value={state}>
        {children}
      </ConfigStateContext.Provider>
    </ConfigActionsContext.Provider>
  );
}

/** Subscribe to read-only config state (re-renders on state changes). */
export function useConfigState() {
  const ctx = useContext(ConfigStateContext);
  if (!ctx) throw new Error('useConfigState must be used within a CharacterConfigProvider');
  return ctx;
}

/** Subscribe to stable config actions (never causes re-renders). */
export function useConfigActions() {
  const ctx = useContext(ConfigActionsContext);
  if (!ctx) throw new Error('useConfigActions must be used within a CharacterConfigProvider');
  return ctx;
}

/**
 * Combined hook — returns both state and actions.
 * Kept for backward compatibility with restricted files (hooks/utils/).
 * Prefer useConfigState() or useConfigActions() for targeted subscriptions.
 */
export function useConfig() {
  return { ...useConfigState(), ...useConfigActions() };
}
