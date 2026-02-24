import { useState, useCallback, useRef, useEffect, useMemo, memo, lazy, Suspense, type CSSProperties } from "react";
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
import { SK_SPLIT_WIDTH } from "@/constants/storage-keys";
import styles from "./SplitLayout.module.css";

const ChatArea = lazy(() => import("../chat/ChatArea").then(m => ({ default: m.ChatArea })));
const Constellation = lazy(() => import("../ability/Constellation").then(m => ({ default: m.Constellation })));
const EMPTY_IMAGES: never[] = [];
const clampSplitWidth = (w: number) => Math.max(360, Math.min(500, w));

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

  // Split width state with localStorage persistence
  const [splitWidth, setSplitWidth] = useState(() => {
    const saved = localStorage.getItem(SK_SPLIT_WIDTH);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed >= 360 && parsed <= 500) return parsed;
    }
    return 420; // default
  });

  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(splitWidth);
  const dividerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Save to localStorage when drag ends
  const saveSplitWidth = useCallback((width: number) => {
    localStorage.setItem(SK_SPLIT_WIDTH, String(width));
  }, []);

  // Divider drag handlers — use direct DOM CSS variable manipulation during drag
  // to avoid setState on every pointermove frame (P1-10 perf fix)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
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
    const newWidth = clampSplitWidth(startWidthRef.current + delta);
    // Direct DOM update — no React re-render per frame
    rootRef.current?.style.setProperty("--split-left", `${newWidth}px`);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Commit final width to React state + localStorage
    const delta = e.clientX - startXRef.current;
    const finalWidth = clampSplitWidth(startWidthRef.current + delta);
    setSplitWidth(finalWidth);
    saveSplitWidth(finalWidth);
  }, [saveSplitWidth]);

  // Keyboard control for divider
  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = 10;
      const delta = e.key === "ArrowRight" ? step : -step;
      setSplitWidth(prev => {
        const next = clampSplitWidth(prev + delta);
        saveSplitWidth(next);
        return next;
      });
    }
  }, [saveSplitWidth]);

  // CSS variable for grid
  const rootStyle = useMemo<CSSProperties>(() => ({
    ["--split-left" as string]: `${splitWidth}px`,
  }), [splitWidth]);

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
        aria-valuemin={360}
        aria-valuemax={500}
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
                <Suspense fallback={null}>
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
                <Suspense fallback={null}>
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
