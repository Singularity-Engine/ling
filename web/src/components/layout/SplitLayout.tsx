import { useState, useCallback, useRef, useEffect, useMemo, memo, Suspense, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { SectionErrorBoundary } from "../error/SectionErrorBoundary";
import { Live2D } from "../canvas/live2d";
import { InputBar } from "../chat/InputBar";
import { ConnectionStatus } from "../status/ConnectionStatus";
import { AffinityBadge } from "../status/AffinityBadge";
import CreditsDisplay from "../billing/CreditsDisplay";
import { ExperimentBar } from "../experiment/ExperimentBar";
import { StarField } from "../background/StarField";
import { BackgroundReactor } from "../effects/BackgroundReactor";
import { AudioVisualizer } from "../effects/AudioVisualizer";
import { CrystalField } from "../crystal/CrystalField";
import { TapParticles } from "../effects/TapParticles";
import { LoadingSkeleton } from "../loading/LoadingSkeleton";
import { SuggestionChips } from "../chat/SuggestionChips";
import { useChatMessagesState, useChatMessagesActions } from "@/context/ChatHistoryContext";
import { useWebSocketState, useWebSocketActions } from "@/context/WebsocketContext";
import { useAiStateRead } from "@/context/AiStateContext";
import { focusTextarea } from "@/utils/dom";
import { lazyRetry } from "@/utils/lazy-retry";
import styles from "./SplitLayout.module.css";

const ChatArea = lazyRetry(() => import("../chat/ChatArea").then(m => ({ default: m.ChatArea })));
const Constellation = lazyRetry(() => import("../ability/Constellation").then(m => ({ default: m.Constellation })));
const EMPTY_IMAGES: never[] = [];

interface SplitBounds {
  min: number;
  max: number;
  defaultWidth: number;
}

const FALLBACK_VIEWPORT_WIDTH = 1440;

const getAdaptiveSplitBounds = (viewportWidth: number): SplitBounds => {
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : FALLBACK_VIEWPORT_WIDTH;

  const min = Math.max(380, Math.min(620, Math.round(safeWidth * 0.27)));
  const max = Math.max(min + 140, Math.min(1260, Math.round(safeWidth * 0.56)));
  const defaultWidth = Math.max(min, Math.min(max, Math.round(safeWidth * 0.41)));

  return { min, max, defaultWidth };
};

const clampSplitWidth = (w: number, bounds: SplitBounds) => Math.max(bounds.min, Math.min(bounds.max, w));

interface ChatWidthVars {
  railMax: number;
  aiMax: number;
  userMax: number;
  inputMax: number;
  toolMax: number;
  chipsMax: number;
}

const getAdaptiveChatWidths = (viewportWidth: number, splitWidth: number): ChatWidthVars => {
  const safeViewport = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : FALLBACK_VIEWPORT_WIDTH;
  const rightPanelWidth = Math.max(560, safeViewport - splitWidth - 4);

  const railMax = Math.max(960, Math.min(1720, Math.round(rightPanelWidth * 0.95)));
  const aiMax = Math.max(760, Math.min(1550, Math.round(rightPanelWidth * 0.9)));
  const userMax = Math.max(680, Math.min(1400, Math.round(rightPanelWidth * 0.82)));
  const inputMax = Math.max(760, Math.min(1500, Math.round(rightPanelWidth * 0.9)));
  const toolMax = Math.max(820, Math.min(1540, Math.round(rightPanelWidth * 0.9)));
  const chipsMax = Math.max(420, Math.min(760, Math.round(rightPanelWidth * 0.52)));

  return { railMax, aiMax, userMax, inputMax, toolMax, chipsMax };
};

interface SplitLayoutProps {
  /** First-minute experience phase — passed from MainContent to avoid duplicate timers */
  firstMinutePhase?: string;
}

/**
 * SplitLayout — Desktop (≥1024px) left-right split.
 * Left: Live2D character panel (fixed px width, 360-500).
 * Right: Chat + toolbar.
 */
export const SplitLayout = memo(function SplitLayout({ firstMinutePhase }: SplitLayoutProps): JSX.Element {
  const { t } = useTranslation();
  const { messages } = useChatMessagesState();
  const { appendHumanMessage } = useChatMessagesActions();
  const { isThinkingSpeaking } = useAiStateRead();
  const { wsState } = useWebSocketState();
  const { sendMessage } = useWebSocketActions();
  const isConnected = wsState === "OPEN";
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const [splitBounds, setSplitBounds] = useState<SplitBounds>(() =>
    getAdaptiveSplitBounds(typeof window !== "undefined" ? window.innerWidth : FALLBACK_VIEWPORT_WIDTH)
  );

  // Split width state — auto-optimized by viewport width, overridable via drag.
  const [splitWidth, setSplitWidth] = useState(() => {
    const bounds = getAdaptiveSplitBounds(
      typeof window !== "undefined" ? window.innerWidth : FALLBACK_VIEWPORT_WIDTH
    );
    return bounds.defaultWidth;
  });
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : FALLBACK_VIEWPORT_WIDTH
  );

  const isDraggingRef = useRef(false);
  const manualOverrideRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(splitWidth);
  const dividerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep split bounds adaptive to viewport size; clamp current width into new range.
  useEffect(() => {
    let rafId = 0;
    const updateBounds = () => {
      const nextViewport = window.innerWidth;
      setViewportWidth(nextViewport);
      const nextBounds = getAdaptiveSplitBounds(nextViewport);
      setSplitBounds((prev) => (
        prev.min === nextBounds.min
        && prev.max === nextBounds.max
        && prev.defaultWidth === nextBounds.defaultWidth
      ) ? prev : nextBounds);
      setSplitWidth((prev) => (
        manualOverrideRef.current
          ? clampSplitWidth(prev, nextBounds)
          : nextBounds.defaultWidth
      ));
    };
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateBounds();
      });
    };
    updateBounds();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Divider drag handlers — use direct DOM CSS variable manipulation during drag
  // to avoid setState on every pointermove frame (P1-10 perf fix)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    manualOverrideRef.current = true;
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = splitWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [splitWidth]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = clampSplitWidth(startWidthRef.current + delta, splitBounds);
    // Direct DOM update — no React re-render per frame
    rootRef.current?.style.setProperty("--split-left", `${newWidth}px`);
  }, [splitBounds]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Commit final width to React state
    const delta = e.clientX - startXRef.current;
    const finalWidth = clampSplitWidth(startWidthRef.current + delta, splitBounds);
    setSplitWidth(finalWidth);
  }, [splitBounds]);

  // Keyboard control for divider
  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      manualOverrideRef.current = true;
      const step = 12;
      const delta = e.key === "ArrowRight" ? step : -step;
      setSplitWidth(prev => {
        return clampSplitWidth(prev + delta, splitBounds);
      });
    }
  }, [splitBounds]);

  // CSS variable for grid
  const rootStyle = useMemo<CSSProperties>(() => {
    const chatWidths = getAdaptiveChatWidths(viewportWidth, splitWidth);
    return {
      ["--split-left" as string]: `${splitWidth}px`,
      ["--split-left-min" as string]: `${splitBounds.min}px`,
      ["--split-left-max" as string]: `${splitBounds.max}px`,
      ["--ling-chat-rail-max-width" as string]: `${chatWidths.railMax}px`,
      ["--ling-chat-ai-max-width" as string]: `${chatWidths.aiMax}px`,
      ["--ling-chat-user-max-width" as string]: `${chatWidths.userMax}px`,
      ["--ling-chat-input-max-width" as string]: `${chatWidths.inputMax}px`,
      ["--ling-chat-tool-max-width" as string]: `${chatWidths.toolMax}px`,
      ["--ling-chat-chips-max-width" as string]: `${chatWidths.chipsMax}px`,
    };
  }, [splitWidth, splitBounds.max, splitBounds.min, viewportWidth]);

  // GPU hint during drag
  const leftPanelStyle = useMemo<CSSProperties>(() => ({
    willChange: isDragging ? "width" : "auto",
    transition: isDragging ? "none" : undefined,
  }), [isDragging]);

  // Empty state detection
  const isEmpty = messages.length === 0 && !isThinkingSpeaking;

  // Randomized welcome chips for empty state
  const [welcomeChips] = useState(() => {
    const pool = t("ui.welcomeChips", { returnObjects: true }) as string[];
    if (!Array.isArray(pool) || pool.length <= 4) return pool;
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4);
  });

  const handleChipClick = useCallback(
    (text: string) => {
      if (!isConnectedRef.current) return;
      appendHumanMessage(text);
      sendMessage({ type: "text-input", text, images: EMPTY_IMAGES });
      setTimeout(focusTextarea, 0);
    },
    [appendHumanMessage, sendMessage]
  );

  return (
    <div ref={rootRef} className={styles.root} style={rootStyle} data-first-minute={firstMinutePhase}>
      {/* ── Left Panel: Live2D ── */}
      <aside
        className={styles.leftPanel}
        style={leftPanelStyle}
        aria-label={t("ui.characterPanel", "Character")}
      >
        {/* Starfield behind character */}
        <div className={styles.starfieldBg}>
          <StarField />
        </div>

        <SectionErrorBoundary name="Live2D">
          <Live2D />
        </SectionErrorBoundary>

        <TapParticles />

        {/* Effects layer */}
        <SectionErrorBoundary name="Effects">
          <div className={styles.effectsLayer}>
            <BackgroundReactor />
            <AudioVisualizer />
          </div>
        </SectionErrorBoundary>

        <LoadingSkeleton />

        <SectionErrorBoundary name="CrystalField">
          <CrystalField />
        </SectionErrorBoundary>
      </aside>

      {/* ── Divider ── */}
      <div
        ref={dividerRef}
        className={`${styles.divider} ${isDragging ? styles.dividerDragging : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={splitWidth}
        aria-valuemin={splitBounds.min}
        aria-valuemax={splitBounds.max}
        aria-label={t("ui.resizeDivider", "Resize panels")}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onDividerKeyDown}
      />

      {/* ── Right Panel: Chat ── */}
      <div className={styles.rightPanel}>
        {/* Glow bleed from character panel */}
        <div className={styles.glowBleed} />

        {/* ExperimentBar — right panel only */}
        <div className={styles.experimentBar}>
          <SectionErrorBoundary name="ExperimentBar">
            <ExperimentBar />
          </SectionErrorBoundary>
        </div>

        {/* Toolbar — tier 1 (always visible): connection; tier 2 (in capsule): credits, affinity */}
        <div className={styles.toolbar}>
          <SectionErrorBoundary name="Toolbar">
            <div className={styles.toolbarGroup}>
              <ConnectionStatus />
              <div className={styles.toolbarDivider} />
              <CreditsDisplay />
              <AffinityBadge />
            </div>
          </SectionErrorBoundary>
        </div>

        {/* Chat section */}
        <div className={styles.chatSection}>
          {isEmpty ? (
            /* ── Empty state: warm welcome ── */
            <div className={styles.emptyState}>
              <span className={styles.emptyLogo}>{t("loading.glyph")}</span>
              <span className={styles.emptyText}>
                {isConnected
                  ? t("ui.splitEmptyWelcome", "Start chatting with Ling...")
                  : t("ui.emptySubHintDisconnected")}
              </span>
              {isConnected && (
                <div className={styles.emptyChips}>
                  <SuggestionChips chips={welcomeChips} onChipClick={handleChipClick} centered baseDelay={0.2} />
                </div>
              )}
            </div>
          ) : (
            /* ── Chat messages ── */
            <div className={styles.chatInner}>
              <SectionErrorBoundary name="ChatArea" fallback={
                <div className={styles.chatErrorFallback}>
                  {t("error.chatRenderFailed")}
                </div>
              }>
                <Suspense fallback={<div className={styles.lazySkeleton} />}>
                  <ChatArea />
                </Suspense>
              </SectionErrorBoundary>
            </div>
          )}

          {/* Input bar */}
          <div className={styles.inputSection}>
            {/* Constellation — above input (desktop only) */}
            <SectionErrorBoundary name="Constellation">
              <div className={styles.constellationWrap}>
                <Suspense fallback={<div className={styles.lazySkeleton} />}>
                  <Constellation />
                </Suspense>
              </div>
            </SectionErrorBoundary>

            <SectionErrorBoundary name="InputBar" fallback={
              <div className={styles.inputErrorFallback}>
                {t("error.inputBarFailed")}
              </div>
            }>
              <InputBar />
            </SectionErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
});
