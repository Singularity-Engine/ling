import type { IpcRenderer } from 'electron';
import type { LAppAdapter } from '../WebSDK/src/lappadapter';
import type { LAppLive2DManager } from '../WebSDK/src/lapplive2dmanager';
import type { ToolCategory } from './context/tool-state-context';

declare global {
  interface Window {
    // ─── Electron IPC ───────────────────────────────────────────
    electron?: {
      ipcRenderer: IpcRenderer;
      process: { platform: string };
    };

    // ─── Electron preload API ───────────────────────────────────
    api?: {
      setIgnoreMouseEvents: (ignore: boolean) => void;
      setMode: (mode: string) => void;
      showContextMenu?: () => void;
      onModeChanged: (callback: (mode: string) => void) => void;
      updateComponentHover: (componentId: string, isHover: boolean) => void;
      updateConfigFiles: (configFiles: Record<string, string>) => void;
      toggleForceIgnoreMouse: () => void;
      onToggleInputSubtitle: (callback: () => void) => (() => void) | undefined;
    };

    // ─── Live2D globals (set in main.tsx / WebSDK) ──────────────
    getLAppAdapter?: () => LAppAdapter;
    getLive2DManager?: () => LAppLive2DManager;
    LAppDefine?: { CurrentKScale: number };
    LAppLive2DManager?: { releaseInstance: () => void };

    // ─── Debug / dev-only globals ───────────────────────────────
    Live2DDebug?: Record<string, (...args: unknown[]) => unknown>;
    __triggerToolDemo?: (category?: ToolCategory) => void;
    inputSubtitle?: { open: () => void; close: () => void };
  }
}

export {};
