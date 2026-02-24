/* eslint-disable no-use-before-define */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-underscore-dangle */
import { useEffect, useCallback, RefObject, useRef } from 'react';
import { ModelInfo } from '@/context/Live2dConfigContext';
import { LAppDelegate } from '../../../WebSDK/src/lappdelegate';
import { LAppLive2DManager } from '../../../WebSDK/src/lapplive2dmanager';
import { useMode } from '@/context/ModeContext';

// Constants for model scaling behavior
const MIN_ZOOM = 0.3;         // Minimum zoom factor (30% of base)
const MAX_ZOOM = 3.0;         // Maximum zoom factor (300% of base)
const EASING_FACTOR = 0.3;    // Controls animation smoothness
const WHEEL_ZOOM_STEP = 0.05; // Zoom change per wheel tick
const ZOOM_EPSILON = 0.001;   // Stop animating below this diff

interface UseLive2DResizeProps {
  containerRef: RefObject<HTMLDivElement>;
  modelInfo?: ModelInfo;
  showSidebar?: boolean; // Sidebar collapse state
}

/**
 * Apply absolute scale to the model matrix.
 * Preserves translation consistency by scaling tx/ty proportionally.
 */
const applyAbsoluteScale = (absoluteScale: number) => {
  try {
    const manager = LAppLive2DManager.getInstance();
    if (!manager) return;

    const model = manager.getModel(0);
    if (!model) return;

    // @ts-ignore - accessing internal _modelMatrix
    const matrix = model._modelMatrix;
    const arr = matrix.getArray();
    const oldScale = arr[0];
    if (oldScale === 0 || absoluteScale === oldScale) return;

    // Scale translation proportionally to keep the model centered
    const ratio = absoluteScale / oldScale;
    matrix.scale(absoluteScale, absoluteScale);
    const updated = matrix.getArray();
    updated[12] = arr[12] * ratio;
    updated[13] = arr[13] * ratio;
  } catch {
    // Model not ready for scaling yet — silent fallthrough
  }
};

/** @deprecated Use applyAbsoluteScale internally. Kept for external callers. */
export const applyScale = applyAbsoluteScale;

/**
 * Hook to handle Live2D model resizing and scaling
 * Provides smooth scaling animation and window resize handling
 */
export const useLive2DResize = ({
  containerRef,
  modelInfo,
  showSidebar,
}: UseLive2DResizeProps) => {
  const { mode } = useMode();
  const isPet = mode === 'pet';
  const animationFrameIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isResizingRef = useRef<boolean>(false);

  // Zoom state: zoomFactor is relative to the SDK's bbox-fitted base scale.
  // baseScaleRef captures _modelMatrix._tr[0] when the user first zooms,
  // so we apply (baseScale * zoomFactor) instead of overwriting the fitScale.
  const baseScaleRef = useRef<number | null>(null);
  const currentZoomRef = useRef<number>(1.0);
  const targetZoomRef = useRef<number>(1.0);
  const animationFrameRef = useRef<number>();
  const isAnimatingRef = useRef<boolean>(false);
  const hasAppliedInitialScale = useRef<boolean>(false);

  // Previous container dimensions for change detection
  const lastContainerDimensionsRef = useRef<{width: number, height: number}>({ width: 0, height: 0 });

  // Previous sidebar state
  const prevSidebarStateRef = useRef<boolean | undefined>(showSidebar);

  /**
   * Reset zoom state when model changes
   */
  useEffect(() => {
    baseScaleRef.current = null; // Will be re-captured on next zoom
    currentZoomRef.current = 1.0;
    targetZoomRef.current = 1.0;
    hasAppliedInitialScale.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      isAnimatingRef.current = false;
    }

    const resizeHandle = requestAnimationFrame(() => {
      handleResize();
    });

    return () => cancelAnimationFrame(resizeHandle);
  }, [modelInfo?.url, modelInfo?.kScale]);

  /**
   * Smooth animation loop for zoom.
   * Interpolates zoomFactor toward target, applies (baseScale * zoom).
   * Stops when the difference is negligible (avoids running forever).
   */
  const animateEase = useCallback(() => {
    const base = baseScaleRef.current;
    if (base === null) {
      isAnimatingRef.current = false;
      return;
    }

    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoomRef.current));
    const current = currentZoomRef.current;
    const diff = target - current;

    // Stop when close enough — don't waste frames
    if (Math.abs(diff) < ZOOM_EPSILON) {
      applyAbsoluteScale(base * target);
      currentZoomRef.current = target;
      isAnimatingRef.current = false;
      return;
    }

    const newZoom = current + diff * EASING_FACTOR;
    applyAbsoluteScale(base * newZoom);
    currentZoomRef.current = newZoom;

    animationFrameRef.current = requestAnimationFrame(animateEase);
  }, []);

  /**
   * Captures the SDK's base scale from the model matrix.
   * Called once on the first zoom interaction so subsequent zooms
   * multiply against the bbox-fitted scale rather than overwriting it.
   */
  const captureBaseScale = useCallback((): boolean => {
    if (baseScaleRef.current !== null) return true;
    try {
      const manager = LAppLive2DManager.getInstance();
      const model = manager?.getModel(0);
      // @ts-ignore
      const arr = model?._modelMatrix?.getArray();
      if (arr && arr[0] !== 0) {
        baseScaleRef.current = arr[0];
        return true;
      }
    } catch { /* model not ready */ }
    return false;
  }, []);

  /**
   * Handles mouse wheel events for zooming.
   * Adjusts zoom factor relative to SDK base scale.
   */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!modelInfo?.scrollToResize) return;
    if (!captureBaseScale()) return; // model not ready

    const direction = e.deltaY > 0 ? -1 : 1;
    targetZoomRef.current = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, targetZoomRef.current + WHEEL_ZOOM_STEP * direction),
    );

    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      animationFrameRef.current = requestAnimationFrame(animateEase);
    }
  }, [modelInfo?.scrollToResize, animateEase, captureBaseScale]);

  /**
   * Pre-process container resize
   * Preserve aspect ratio temporarily before actual change
   */
  const beforeResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isResizingRef.current = true;

    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);

  /**
   * Handles window/container resize events
   * Updates canvas dimensions and model scaling
   */
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (!isResizingRef.current) {
      beforeResize();
    }

    try {
      const containerBounds = containerRef.current?.getBoundingClientRect();
      const isMobileView = !isPet && typeof window !== "undefined" && window.innerWidth < 768;
      const { width, height } = isPet || isMobileView
        ? { width: window.innerWidth, height: window.innerHeight }
        : containerBounds || { width: 0, height: 0 };





      const lastDimensions = lastContainerDimensionsRef.current;
      const sidebarChanged = prevSidebarStateRef.current !== showSidebar;
      const dimensionsChanged = Math.abs(lastDimensions.width - width) > 1 || Math.abs(lastDimensions.height - height) > 1;
      const hasChanged = dimensionsChanged || sidebarChanged;

      if (!hasChanged && hasAppliedInitialScale.current) {
        isResizingRef.current = false;
        return;
      }

      lastContainerDimensionsRef.current = { width, height };
      prevSidebarStateRef.current = showSidebar;

      if (!containerBounds && !isPet) {
        if (import.meta.env.DEV) console.warn('[Resize] Container bounds not available in window mode.');
      }
      if (width === 0 || height === 0) {
        if (import.meta.env.DEV) console.warn('[Resize] Width or Height is zero, skipping canvas/delegate update.');
        isResizingRef.current = false;
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x to avoid exceeding Safari WebGL max texture size on high-dpr devices
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.marginLeft = '0px';
      canvas.style.marginTop = '0px';

      const delegate = LAppDelegate.getInstance();
      if (delegate) {
        delegate.onResize();
      } else {
        if (import.meta.env.DEV) console.warn('[Resize] LAppDelegate instance not found.');
      }

      isResizingRef.current = false;
    } catch (error) {
      isResizingRef.current = false;
    }
  }, [isPet, containerRef, modelInfo?.kScale, modelInfo?.initialXshift, modelInfo?.initialYshift, showSidebar, beforeResize, canvasRef]);

  // Immediately respond to sidebar state changes
  useEffect(() => {
    if (prevSidebarStateRef.current !== showSidebar) {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      animationFrameIdRef.current = requestAnimationFrame(() => {
        handleResize();
        animationFrameIdRef.current = null;
      });
    }
  }, [showSidebar, handleResize]);

  // Set up event listeners and cleanup for wheel scaling
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (canvasElement) {
      canvasElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        canvasElement.removeEventListener('wheel', handleWheel);
      };
    }
    return undefined;
  }, [handleWheel, canvasRef]);

  // Clean up animations on unmount
  useEffect(() => () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);


  // Monitor container size changes using ResizeObserver
  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) {
      return undefined;
    }

    if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
    animationFrameIdRef.current = requestAnimationFrame(() => {
      handleResize();
      animationFrameIdRef.current = null;
    });

    const observer = new ResizeObserver(() => {
      if (!isResizingRef.current) {
        if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(() => {
          handleResize();
          animationFrameIdRef.current = null;
        });
      }
    });

    observer.observe(containerElement);

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      observer.disconnect();
    };
  }, [containerRef, handleResize]);

  // Monitor window size changes (mainly for 'pet' mode or fallback)
  useEffect(() => {
    const handleWindowResize = () => {
      if (!isResizingRef.current) {
        if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(() => {
          handleResize();
          animationFrameIdRef.current = null;
        });
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [handleResize]);

  return { canvasRef, handleResize };
};

/**
 * Helper function to set model scale with device pixel ratio consideration
 * @deprecated This logic might be better handled within the view matrix scaling
 */
export const setModelScale = (
  model: any,
  kScale: string | number | undefined,
) => {
  if (!model || kScale === undefined) return;
  if (import.meta.env.DEV) console.warn("setModelScale is potentially deprecated; scaling is primarily handled by view matrix now.");
};

