import { useEffect, useCallback } from "react";
import { useInterrupt } from "@/components/canvas/live2d";
import { useMicToggle } from "./use-mic-toggle";
import { useLive2DConfig } from "@/context/Live2dConfigContext";
import { useSwitchCharacter } from "@/hooks/utils/use-switch-character";
import { useForceIgnoreMouse } from "@/hooks/utils/use-force-ignore-mouse";
import { useMode } from "@/context/ModeContext";
import { createLogger } from "@/utils/logger";

const log = createLogger('IpcHandlers');

export function useIpcHandlers() {
  const { handleMicToggle } = useMicToggle();
  const { interrupt } = useInterrupt();
  const { modelInfo, setModelInfo } = useLive2DConfig();
  const { switchCharacter } = useSwitchCharacter();
  const { setForceIgnoreMouse } = useForceIgnoreMouse();
  const { mode } = useMode();
  const isPet = mode === 'pet';

  const micToggleHandler = useCallback(() => {
    handleMicToggle();
  }, [handleMicToggle]);

  const interruptHandler = useCallback(() => {
    interrupt();
  }, [interrupt]);

  const scrollToResizeHandler = useCallback(() => {
    if (modelInfo) {
      setModelInfo({
        ...modelInfo,
        scrollToResize: !modelInfo.scrollToResize,
      });
    }
  }, [modelInfo, setModelInfo]);

  const switchCharacterHandler = useCallback(
    (_event: unknown, filename: string) => {
      switchCharacter(filename);
    },
    [switchCharacter],
  );

  // Handler for force ignore mouse state changes from main process
  const forceIgnoreMouseChangedHandler = useCallback(
    (_event: unknown, isForced: boolean) => {
      log.debug("Force ignore mouse changed:", isForced);
      setForceIgnoreMouse(isForced);
    },
    [setForceIgnoreMouse],
  );

  // Handle toggle force ignore mouse from menu
  const toggleForceIgnoreMouseHandler = useCallback(() => {
    window.api?.toggleForceIgnoreMouse();
  }, []);

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;
    if (!isPet) return;

    // Use specific removeListener instead of removeAllListeners to avoid
    // nuking handlers added by other modules (Sentry, debug tools, etc.)
    const ipc = window.electron.ipcRenderer;

    ipc.on("mic-toggle", micToggleHandler);
    ipc.on("interrupt", interruptHandler);
    ipc.on("toggle-scroll-to-resize", scrollToResizeHandler);
    ipc.on("switch-character", switchCharacterHandler);
    ipc.on("toggle-force-ignore-mouse", toggleForceIgnoreMouseHandler);
    ipc.on("force-ignore-mouse-changed", forceIgnoreMouseChangedHandler);

    return () => {
      const r = window.electron?.ipcRenderer;
      if (!r) return;
      r.removeListener("mic-toggle", micToggleHandler);
      r.removeListener("interrupt", interruptHandler);
      r.removeListener("toggle-scroll-to-resize", scrollToResizeHandler);
      r.removeListener("switch-character", switchCharacterHandler);
      r.removeListener("toggle-force-ignore-mouse", toggleForceIgnoreMouseHandler);
      r.removeListener("force-ignore-mouse-changed", forceIgnoreMouseChangedHandler);
    };
  }, [
    micToggleHandler,
    interruptHandler,
    scrollToResizeHandler,
    switchCharacterHandler,
    toggleForceIgnoreMouseHandler,
    forceIgnoreMouseChangedHandler,
    isPet,
  ]);
}
