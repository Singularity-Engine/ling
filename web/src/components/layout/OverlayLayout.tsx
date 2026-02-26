/**
 * OverlayLayout — Mobile/tablet overlay mode.
 *
 * Full-screen Live2D with floating chat area overlaid on top.
 * Extracted from App.tsx MainContent for Phase 4 refactoring.
 *
 * This is a PURE RENDERING component: all state and handlers are
 * received as props from MainContent in App.tsx.
 */

import React, { Suspense, useMemo, useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { SectionErrorBoundary } from "../error/SectionErrorBoundary";
import { Live2D } from "../canvas/live2d";
import { InputBar } from "../chat/InputBar";
import { ConnectionStatus } from "../status/ConnectionStatus";
import { AffinityBadge } from "../status/AffinityBadge";
import CreditsDisplay from "../billing/CreditsDisplay";
import { VitalsBar } from "../vitals/VitalsBar";
import { useVitalsData } from "@/hooks/useVitalsData";
import { DashboardOverlay } from "../dashboard/DashboardOverlay";
import { useDashboardData } from "@/hooks/useDashboardData";
import { StarField } from "../background/StarField";
import { BackgroundReactor } from "../effects/BackgroundReactor";
import { AudioVisualizer } from "../effects/AudioVisualizer";
import { CrystalField } from "../crystal/CrystalField";
import { TapParticles } from "../effects/TapParticles";
import { LoadingSkeleton } from "../loading/LoadingSkeleton";
import { ICON_CHAT, ICON_MEMORY, ICON_INFO, ICON_CHEVRON_UP, ICON_MENU, ICON_CLOSE } from "./overlay-icons";
import { lazyRetry } from "@/utils/lazy-retry";
import styles from "./OverlayLayout.module.css";

const ChatArea = lazyRetry(() => import("../chat/ChatArea").then(m => ({ default: m.ChatArea })));
const Constellation = lazyRetry(() => import("../ability/Constellation").then(m => ({ default: m.Constellation })));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Button className: global ling-action-btn + module size class */
function btnClass(mobile: boolean): string {
  return `ling-action-btn ${styles.actionBtn} ${mobile ? styles.actionBtnMobile : styles.actionBtnDesktop}`;
}

/** Chat inner data-state attribute for CSS-driven max-height */
function chatState(mobile: boolean, expanded: boolean): string {
  if (!expanded) return "closed";
  return mobile ? "mobile-open" : "desktop-open";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OverlayLayoutProps {
  isMobile: boolean;
  chatExpanded: boolean;
  kbOffset: number;
  menuOpen: boolean;
  menuClosing: boolean;
  showCreditsBadge: boolean;
  memoryOpen: boolean;
  aboutOpen: boolean;
  toggleChat: () => void;
  collapseChat: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  openMemory: () => void;
  openAbout: () => void;
  handleMenuKeyDown: (e: React.KeyboardEvent) => void;
  handleExpandKeyDown: (e: React.KeyboardEvent) => void;
  hamburgerRef: React.RefObject<HTMLButtonElement | null>;
  menuPanelRef: React.RefObject<HTMLDivElement | null>;
  /** First-minute experience phase — used as data attribute for CSS-driven animations */
  firstMinutePhase?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const OverlayLayout = React.memo(function OverlayLayout({
  isMobile,
  chatExpanded,
  kbOffset,
  menuOpen,
  menuClosing,
  showCreditsBadge,
  memoryOpen,
  aboutOpen,
  toggleChat,
  collapseChat,
  openMenu,
  closeMenu,
  openMemory,
  openAbout,
  handleMenuKeyDown,
  handleExpandKeyDown,
  hamburgerRef,
  menuPanelRef,
  firstMinutePhase,
}: OverlayLayoutProps) {
  const { t } = useTranslation();
  const vitals = useVitalsData();
  const dashData = useDashboardData();
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const centerBtnRef = useRef<HTMLButtonElement>(null);

  // Keyboard shortcut: Cmd+D / Ctrl+D to toggle dashboard overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        setDashboardOpen(v => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Return focus to VitalsBar center button when dashboard closes
  const handleDashboardClose = useCallback(() => {
    setDashboardOpen(false);
    requestAnimationFrame(() => centerBtnRef.current?.focus());
  }, []);

  // CSS variables for keyboard offset — drives chatOuter transform via CSS
  const chatOuterVars = useMemo<CSSProperties>(() => ({
    '--kb-offset': kbOffset > 0 ? `${kbOffset}px` : '0px',
    '--kb-transition': kbOffset > 0 ? 'none' : undefined,
  } as CSSProperties), [kbOffset]);

  return (
    <div className={styles.root} data-first-minute={firstMinutePhase}>
      {/* ===== VitalsBar — fixed top strip ===== */}
      <div className={styles.vitalsMini}>
        <VitalsBar vitals={vitals} onCenterClick={() => setDashboardOpen(v => !v)} centerBtnRef={centerBtnRef} />
      </div>

      {/* ===== Dashboard Overlay — full-screen on mobile/tablet ===== */}
      <DashboardOverlay open={dashboardOpen} onClose={handleDashboardClose} data={dashData} />

      {/* ===== Layer -1: StarField ===== */}
      <div className={styles.layerStarfield}>
        <StarField />
      </div>

      {/* ===== Layer 0: Live2D ===== */}
      <SectionErrorBoundary name="Live2D">
        <div className={styles.layerLive2d}>
          <Live2D />
        </div>
      </SectionErrorBoundary>

      {/* ===== Layer 0+: TapParticles ===== */}
      <TapParticles />

      {/* ===== Layer 0.5: Effects ===== */}
      <SectionErrorBoundary name="Effects">
        <div className={styles.layerEffects}>
          <BackgroundReactor />
          <AudioVisualizer />
        </div>
      </SectionErrorBoundary>

      {/* ===== Layer 0.8: LoadingSkeleton ===== */}
      <LoadingSkeleton />

      {/* ===== Layer 1: CrystalField ===== */}
      <SectionErrorBoundary name="CrystalField">
        <CrystalField />
      </SectionErrorBoundary>

      {/* ===== Layer 1.8: Ground gradient ===== */}
      <div className={styles.groundGradient} />

      {/* ===== Layer 1.5: Toolbar ===== */}
      {isMobile ? (
        /* ── Mobile: connection dot + chat toggle + hamburger ── */
        <div className={styles.mobileTrigger}>
          <SectionErrorBoundary name="StatusGroup">
            <ConnectionStatus />
          </SectionErrorBoundary>
          <button
            className={btnClass(true)}
            data-active={chatExpanded}
            onClick={toggleChat}
            aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
            aria-pressed={chatExpanded}
          >
            {ICON_CHAT}
          </button>
          <button
            ref={hamburgerRef}
            className={`${btnClass(true)} ${styles.hamburgerBtn}`}
            data-active={menuOpen || menuClosing}
            onClick={openMenu}
            aria-label={t("ui.menu", "Menu")}
            aria-expanded={menuOpen || menuClosing}
            aria-haspopup="dialog"
          >
            {ICON_MENU}
            {showCreditsBadge && <div className={styles.menuBadge} />}
          </button>
        </div>
      ) : (
        /* ── Tablet: unified capsule (non-split desktop) ── */
        <div className={styles.toolbarDesktop}>
          <SectionErrorBoundary name="Toolbar">
            <div className={styles.toolbarGroup}>
              <CreditsDisplay />
              <AffinityBadge />
              <ConnectionStatus />
              <div className={styles.toolbarDivider} />
              <button
                className={btnClass(false)}
                data-active={chatExpanded}
                onClick={toggleChat}
                aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
                aria-pressed={chatExpanded}
                title={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
              >
                {ICON_CHAT}
              </button>
              <button
                className={btnClass(false)}
                data-active={memoryOpen}
                onClick={openMemory}
                aria-label={t("memory.title")}
                title={t("memory.title")}
              >
                {ICON_MEMORY}
              </button>
              <button
                className={btnClass(false)}
                data-active={aboutOpen}
                onClick={openAbout}
                aria-label={t("shortcuts.showAbout")}
                title={t("shortcuts.showAbout")}
              >
                {ICON_INFO}
              </button>
            </div>
          </SectionErrorBoundary>
        </div>
      )}

      {/* ===== Mobile slide-in menu ===== */}
      {(menuOpen || menuClosing) && isMobile && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            aria-hidden="true"
            className={`${styles.menuBackdrop} ${menuClosing ? styles.menuBackdropClosing : ""}`}
            onClick={closeMenu}
          />
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div
            ref={menuPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("ui.menu", "Menu")}
            className={`${styles.mobileMenu} ${menuClosing ? styles.mobileMenuClosing : ""}`}
            onKeyDown={handleMenuKeyDown}
          >
            <div className={styles.menuHeader}>
              <button
                className={btnClass(true)}
                onClick={closeMenu}
                aria-label={t("ui.close", "Close")}
                autoFocus
              >
                {ICON_CLOSE}
              </button>
            </div>
            <SectionErrorBoundary name="MenuStatus">
              <div className={styles.menuStatus}>
                <CreditsDisplay />
                <AffinityBadge />
                <ConnectionStatus />
              </div>
            </SectionErrorBoundary>
            <div className={styles.menuSep} />
            <button
              className={`ling-menu-item ${styles.menuItem}`}
              onClick={() => { openMemory(); closeMenu(); }}
            >
              {ICON_MEMORY}
              <span>{t("memory.title")}</span>
            </button>
            <button
              className={`ling-menu-item ${styles.menuItem}`}
              onClick={() => { openAbout(); closeMenu(); }}
            >
              {ICON_INFO}
              <span>{t("shortcuts.showAbout")}</span>
            </button>
          </div>
        </>
      )}

      {/* ===== Layer 2: Floating chat area ===== */}
      <div className={styles.chatOuter} style={chatOuterVars}>
        <div className={styles.chatInner} data-state={chatState(isMobile, chatExpanded)}>
          <SectionErrorBoundary name="ChatArea" fallback={
            <div className={styles.chatFallback}>{t("error.chatRenderFailed")}</div>
          }>
            <Suspense fallback={null}>
              <ChatArea onCollapse={isMobile ? collapseChat : undefined} />
            </Suspense>
          </SectionErrorBoundary>
        </div>

        {!chatExpanded && !isMobile && (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("ui.expandChat")}
            className={styles.expandHandle}
            onClick={toggleChat}
            onKeyDown={handleExpandKeyDown}
          >
            {ICON_CHEVRON_UP}
          </div>
        )}

        <div className={styles.inputSection}>
          {/* Constellation — floats above InputBar (lazy: defers framer-motion chunk) */}
          {!isMobile && (
            <SectionErrorBoundary name="Constellation">
              <div className={styles.constellationWrap}>
                <Suspense fallback={null}>
                  <Constellation />
                </Suspense>
              </div>
            </SectionErrorBoundary>
          )}
          <SectionErrorBoundary name="InputBar" fallback={
            <div className={styles.inputBarBg}>
              <div className={styles.inputFallback}>{i18next.t("error.inputBarFailed")}</div>
            </div>
          }>
            <div className={styles.inputBarBg}>
              <InputBar />
            </div>
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
});
