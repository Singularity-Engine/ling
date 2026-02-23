/**
 * Window augmentation for Live2D APIs injected at runtime.
 *
 * - getLAppAdapter: set in main.tsx → LAppAdapter.getInstance()
 * - getLive2DManager: set by WebSDK/src/lapplive2dmanager.ts
 * - LAppLive2DManager: the manager class itself, exposed by WebSDK
 */

/** Cubism internal wav-file handler — used for lip-sync override in use-audio-task.ts */
interface Live2DWavFileHandler {
  _lastRms: number;
  _externalRms: number;
  _lipSyncOverridden?: boolean;
  getRms(): number;
}

/** Minimal Live2D model interface for APIs used outside WebSDK */
interface Live2DModel {
  startRandomMotion(group: string, priority: number): void;
  /** @internal Cubism wav handler — used for lip-sync override */
  _wavFileHandler?: Live2DWavFileHandler;
  /** @internal Cubism core model — used for parameter access */
  _model?: {
    getParameterCount?(): number;
    getParameterId?(index: number): { getString?(): string } | undefined;
    setParameterValueByIndex(index: number, value: number, weight: number): void;
  };
}

/** Live2D model manager — manages multiple Live2D models */
interface Live2DManager {
  getModel(index: number): Live2DModel | null;
}

/** Minimal LAppAdapter interface for non-WebSDK code.
 *  Only includes methods used outside of restricted files. */
interface LAppAdapterLike {
  setExpression(name: string): void;
  getExpressionName(index: number): string | null;
}

interface Window {
  /** Returns the singleton LAppAdapter (set in main.tsx) */
  getLAppAdapter?(): LAppAdapterLike;
  /** Returns the Live2D model manager (set by WebSDK) */
  getLive2DManager?(): Live2DManager | null;
  /** The LAppLive2DManager class itself (exposed by WebSDK) */
  LAppLive2DManager?: {
    getInstance(): Live2DManager;
  };
}
