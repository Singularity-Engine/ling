/* eslint-disable no-shadow */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { memo, useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useLive2DConfig } from "@/context/Live2dConfigContext";
import { useIpcHandlers } from "@/hooks/utils/use-ipc-handlers";
import { useInterrupt } from "@/hooks/utils/use-interrupt";
import { useAudioTask } from "@/hooks/utils/use-audio-task";
import { useLive2DModel } from "@/hooks/canvas/use-live2d-model";
import { useLive2DResize } from "@/hooks/canvas/use-live2d-resize";
import { useAiState, AiStateEnum } from "@/context/AiStateContext";
import { useLive2DExpression } from "@/hooks/canvas/use-live2d-expression";
import { useForceIgnoreMouse } from "@/hooks/utils/use-force-ignore-mouse";
import { useMode } from "@/context/ModeContext";
import { useWebSocket } from "@/context/WebsocketContext";
import { createLogger } from "@/utils/logger";

interface Live2DProps {
  showSidebar?: boolean;
}

// ── Hoisted styles — avoids allocating new objects every frame (~30fps) ──

const S_CONTAINER_BASE: CSSProperties = {
  width: "100%", height: "100%", overflow: "hidden",
  position: "relative", touchAction: "none",
};
const S_CONTAINER: Record<string, CSSProperties> = {
  "auto_default":   { ...S_CONTAINER_BASE, pointerEvents: "auto", cursor: "default" },
  "auto_grabbing":  { ...S_CONTAINER_BASE, pointerEvents: "auto", cursor: "grabbing" },
  "none_default":   { ...S_CONTAINER_BASE, pointerEvents: "none", cursor: "default" },
  "none_grabbing":  { ...S_CONTAINER_BASE, pointerEvents: "none", cursor: "grabbing" },
};

const S_CANVAS_BASE: CSSProperties = { width: "100%", height: "100%", display: "block" };
const S_CANVAS: Record<string, CSSProperties> = {
  "auto_default":   { ...S_CANVAS_BASE, pointerEvents: "auto", cursor: "default" },
  "auto_grabbing":  { ...S_CANVAS_BASE, pointerEvents: "auto", cursor: "grabbing" },
  "none_default":   { ...S_CANVAS_BASE, pointerEvents: "none", cursor: "default" },
  "none_grabbing":  { ...S_CANVAS_BASE, pointerEvents: "none", cursor: "grabbing" },
};

const S_OVERLAY: CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  background: "rgba(10, 0, 21, 0.85)", backdropFilter: "blur(8px)", zIndex: 10,
};

const S_SPINNER: CSSProperties = {
  width: 48, height: 48, borderRadius: "50%",
  border: "3px solid transparent", borderTopColor: "#8b5cf6",
  animation: "live2d-spin 1s linear infinite",
};

const S_LOADING_TEXT: CSSProperties = {
  marginTop: 16, color: "rgba(255,255,255,0.6)", fontSize: 14,
};

const S_ERROR_TEXT: CSSProperties = {
  color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 12,
};

const S_RETRY_BTN: CSSProperties = {
  padding: "8px 24px", background: "rgba(139, 92, 246, 0.3)",
  border: "1px solid rgba(139, 92, 246, 0.6)", borderRadius: 8,
  color: "#c4b5fd", fontSize: 14, cursor: "pointer",
};

const log = createLogger('Live2D');

export const Live2D = memo(
  ({ showSidebar }: Live2DProps): JSX.Element => {
    const { forceIgnoreMouse } = useForceIgnoreMouse();
    const { modelInfo } = useLive2DConfig();
    const { mode } = useMode();
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const { aiState } = useAiState();
    const { resetExpression } = useLive2DExpression();
    const { wsState, reconnect } = useWebSocket();
    const { t } = useTranslation();
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
        const lappAdapter = window.getLAppAdapter?.();
        if (lappAdapter) {
          resetExpression(lappAdapter, modelInfo);
        }
      }
    }, [aiState, modelInfo, resetExpression]);

    // 连接失败超时后显示重试按钮
    const RETRY_TIMEOUT_MS = 8000;
    useEffect(() => {
      if (wsState === 'OPEN') {
        setShowRetry(false);
        return;
      }
      const timer = setTimeout(() => {
        if (wsState !== 'OPEN') setShowRetry(true);
      }, RETRY_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }, [wsState]);

    // 判断是否需要显示加载覆盖层
    const showOverlay = wsState !== 'OPEN' || !modelInfo?.url;

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      if (!isPet) return;
      e.preventDefault();
      log.debug('(Pet Mode) Right-click detected, requesting menu...');
      window.api?.showContextMenu?.();
    }, [isPet]);

    const handleRetry = useCallback(() => {
      setShowRetry(false);
      reconnect();
    }, [reconnect]);

    // Style variant key — avoids inline object allocation at ~30fps
    const varKey = `${isPet && forceIgnoreMouse ? "none" : "auto"}_${isDragging ? "grabbing" : "default"}`;

    return (
      <div
        ref={internalContainerRef}
        id="live2d-internal-wrapper"
        style={S_CONTAINER[varKey]}
        onContextMenu={handleContextMenu}
        {...handlers}
      >
        <canvas
          id="canvas"
          ref={canvasRef}
          style={S_CANVAS[varKey]}
          aria-hidden="true"
        />
        {showOverlay && (
          <div role="status" aria-live="polite" style={S_OVERLAY}>
            {!showRetry ? (
              <>
                <div style={S_SPINNER} />
                <span style={S_LOADING_TEXT}>{t('loading.awakeningLing')}</span>
              </>
            ) : (
              <>
                <span style={S_ERROR_TEXT}>{t('loading.connectionInterrupted')}</span>
                <button type="button" onClick={handleRetry} style={S_RETRY_BTN}>
                  {t('loading.reconnect')}
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
