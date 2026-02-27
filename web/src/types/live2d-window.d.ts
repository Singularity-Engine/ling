/**
 * Window augmentation for Live2D APIs injected at runtime.
 *
 * - getLAppAdapter: set in entries/ling.tsx → LAppAdapter.getInstance()
 * - getLive2DManager: set by WebSDK/src/lapplive2dmanager.ts
 * - LAppLive2DManager: the manager class itself, exposed by WebSDK
 */

/** Cubism internal wav-file handler — used for lip-sync override in use-audio-task.ts */
interface Live2DWavFileHandler {
  _lastRms: number;
  _externalRms?: number;
  _lipSyncOverridden?: boolean;
  _sampleOffset: number;
  _userTimeSeconds: number;
  getRms(): number;
  releasePcmData(): void;
  start(path: string): void;
}

/** Cubism internal model matrix — used for position/drag in use-live2d-model.ts */
interface Live2DModelMatrix {
  getArray(): number[];
  setMatrix(matrix: number[]): void;
}

/** Cubism internal motion manager */
interface Live2DMotionManager {
  isFinished(): boolean;
}

/** Minimal Live2D model interface for APIs used outside WebSDK */
interface Live2DModel {
  startRandomMotion(group: string, priority: number): void;
  startMotion(group: string, index: number, priority: number): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startTapMotion(hitAreaName: string | null, tapMotions: any): void;
  anyhitTest(x: number, y: number): string | null;
  isHitOnModel(x: number, y: number): boolean;
  /** @internal Cubism wav handler — used for lip-sync override */
  _wavFileHandler?: Live2DWavFileHandler;
  /** @internal Cubism model matrix — used for position/drag */
  _modelMatrix?: Live2DModelMatrix;
  /** @internal Cubism motion manager */
  _motionManager?: Live2DMotionManager;
  /** @internal Cubism core model — used for parameter access */
  _model?: {
    getParameterCount?(): number;
    getParameterId?(index: number): { getString?(): string } | undefined;
    setParameterValueByIndex(index: number, value: number, weight: number): void;
  };
  /** @internal Model settings JSON */
  _modelSetting?: {
    _json?: {
      FileReferences?: {
        Motions?: Record<string, { File: string }[]>;
      };
    };
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
  getExpressionCount(): number;
  getModel(): Live2DModel | null;
  setModelPosition?(x: number, y: number): void;
}

interface Window {
  /** Returns the singleton LAppAdapter (set in entries/ling.tsx) */
  getLAppAdapter?(): LAppAdapterLike;
  /** Returns the Live2D model manager (set by WebSDK) */
  getLive2DManager?(): Live2DManager | null;
  /** The LAppLive2DManager class itself (exposed by WebSDK) */
  LAppLive2DManager?: {
    getInstance(): Live2DManager;
    releaseInstance?(): void;
  };
  /** Live2D SDK defines */
  LAppDefine?: {
    CurrentKScale?: number;
    PriorityNormal?: number;
    [key: string]: unknown;
  };
  /** Live2D debug functions (DEV only) */
  Live2DDebug?: {
    playMotion(motionGroup: string, motionIndex?: number, priority?: number): unknown;
    playRandomMotion(motionGroup: string, priority?: number): unknown;
    getMotionInfo(): { name: string; count: number; motions: { index: number; file: string }[] }[] | null;
    help(): void;
  };
  /** Electron API (available in desktop/pet mode) */
  electron?: {
    ipcRenderer: {
      send(channel: string, ...args: unknown[]): void;
      on(channel: string, listener: (...args: unknown[]) => void): void;
      removeListener(channel: string, listener: (...args: unknown[]) => void): void;
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    };
  };
}
