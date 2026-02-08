/* eslint-disable no-shadow */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { memo, useRef, useEffect, useState } from "react";
import { useLive2DConfig } from "@/context/live2d-config-context";
import { useIpcHandlers } from "@/hooks/utils/use-ipc-handlers";
import { useInterrupt } from "@/hooks/utils/use-interrupt";
import { useAudioTask } from "@/hooks/utils/use-audio-task";
import { useLive2DModel } from "@/hooks/canvas/use-live2d-model";
import { useLive2DResize } from "@/hooks/canvas/use-live2d-resize";
import { useAiState, AiStateEnum } from "@/context/ai-state-context";
import { useLive2DExpression } from "@/hooks/canvas/use-live2d-expression";
import { useForceIgnoreMouse } from "@/hooks/utils/use-force-ignore-mouse";
import { useMode } from "@/context/mode-context";
import { useWebSocket } from "@/context/websocket-context";

interface Live2DProps {
  showSidebar?: boolean;
}

export const Live2D = memo(
  ({ showSidebar }: Live2DProps): JSX.Element => {
    const { forceIgnoreMouse } = useForceIgnoreMouse();
    const { modelInfo } = useLive2DConfig();
    const { mode } = useMode();
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const { aiState } = useAiState();
    const { resetExpression } = useLive2DExpression();
    const { wsState, reconnect } = useWebSocket();
    const [showRetry, setShowRetry] = useState(false);
    const isPet = mode === 'pet';

    // Get canvasRef from useLive2DResize
    const { canvasRef } = useLive2DResize({
      containerRef: internalContainerRef,
      modelInfo,
      showSidebar,
    });

    // Pass canvasRef to useLive2DModel
    const { isDragging, handlers } = useLive2DModel({
      modelInfo,
      canvasRef,
    });

    // Setup hooks
    useIpcHandlers();
    useInterrupt();
    useAudioTask();

    // Reset expression to default when AI state becomes idle
    useEffect(() => {
      if (aiState === AiStateEnum.IDLE) {
        const lappAdapter = (window as any).getLAppAdapter?.();
        if (lappAdapter) {
          resetExpression(lappAdapter, modelInfo);
        }
      }
    }, [aiState, modelInfo, resetExpression]);

    // Expose setExpression for console testing
    // useEffect(() => {
    //   const testSetExpression = (expressionValue: string | number) => {
    //     const lappAdapter = (window as any).getLAppAdapter?.();
    //     if (lappAdapter) {
    //       setExpression(expressionValue, lappAdapter, `[Console Test] Set expression to: ${expressionValue}`);
    //     } else {
    //       console.error('[Console Test] LAppAdapter not found.');
    //     }
    //   };

    //   // Expose the function to the window object
    //   (window as any).testSetExpression = testSetExpression;
    //   console.log('[Debug] testSetExpression function exposed to window.');

    //   // Cleanup function to remove the function from window when the component unmounts
    //   return () => {
    //     delete (window as any).testSetExpression;
    //     console.log('[Debug] testSetExpression function removed from window.');
    //   };
    // }, [setExpression]);

    // 连接失败超时后显示重试按钮
    useEffect(() => {
      if (wsState === 'OPEN') {
        setShowRetry(false);
        return;
      }
      const timer = setTimeout(() => {
        if (wsState !== 'OPEN') setShowRetry(true);
      }, 8000);
      return () => clearTimeout(timer);
    }, [wsState]);

    // 判断是否需要显示加载覆盖层
    const showOverlay = wsState !== 'OPEN' || !modelInfo?.url;

    const handlePointerDown = (e: React.PointerEvent) => {
      handlers.onMouseDown(e);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      if (!isPet) {
        return;
      }

      e.preventDefault();
      console.log(
        "[ContextMenu] (Pet Mode) Right-click detected, requesting menu...",
      );
      window.api?.showContextMenu?.();
    };

    return (
      <div
        ref={internalContainerRef} // Ref for useLive2DResize if it observes this element
        id="live2d-internal-wrapper"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: isPet && forceIgnoreMouse ? "none" : "auto",
          overflow: "hidden",
          position: "relative",
          cursor: isDragging ? "grabbing" : "default",
        }}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        {...handlers}
      >
        <canvas
          id="canvas"
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: isPet && forceIgnoreMouse ? "none" : "auto",
            display: "block",
            cursor: isDragging ? "grabbing" : "default",
          }}
        />
        {showOverlay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10, 0, 21, 0.85)",
              backdropFilter: "blur(8px)",
              zIndex: 10,
            }}
          >
            {!showRetry ? (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    border: "3px solid transparent",
                    borderTopColor: "#8b5cf6",
                    animation: "live2d-spin 1s linear infinite",
                  }}
                />
                <span
                  style={{
                    marginTop: 16,
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 14,
                  }}
                >
                  正在唤醒灵...
                </span>
                <style>{`@keyframes live2d-spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              <>
                <span
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  连接中断，请重试
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowRetry(false);
                    reconnect();
                  }}
                  style={{
                    padding: "8px 24px",
                    background: "rgba(139, 92, 246, 0.3)",
                    border: "1px solid rgba(139, 92, 246, 0.6)",
                    borderRadius: 8,
                    color: "#c4b5fd",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  重新连接
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);

Live2D.displayName = "Live2D";

export { useInterrupt, useAudioTask };
