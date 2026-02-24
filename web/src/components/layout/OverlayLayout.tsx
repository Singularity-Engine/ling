/**
 * OverlayLayout — Mobile/tablet overlay mode.
 *
 * Full-screen Live2D with floating chat area overlaid on top.
 * Extracted from App.tsx MainContent for Phase 4 refactoring.
 *
 * This is a PURE RENDERING component: all state and handlers are
 * received as props from MainContent in App.tsx.
 */

import React, { lazy, Suspense, useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
import styles from "./OverlayLayout.module.css";

const ChatArea = lazy(() => import("../chat/ChatArea").then(m => ({ default: m.ChatArea })));
const Constellation = lazy(() => import("../ability/Constellation").then(m => ({ default: m.Constellation })));

// ─── Icon constants ───────────────────────────────────────────────────────────

const ICON_CHAT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ICON_MEMORY = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
    <path d="M8.24 4.47A4 4 0 0 1 12 2" />
    <path d="M12 9v1" />
    <path d="M4.93 4.93l.7.7" />
    <path d="M19.07 4.93l-.7.7" />
    <path d="M12 22c-4.97 0-9-2.69-9-6v-2c0-3.31 4.03-6 9-6s9 2.69 9 6v2c0 3.31-4.03 6-9 6z" />
  </svg>
);
const ICON_INFO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const ICON_CHEVRON_UP = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const ICON_MENU = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);
const ICON_CLOSE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

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

  // CSS variables for keyboard offset — drives chatOuter transform via CSS
  const chatOuterVars = useMemo<CSSProperties>(() => ({
    '--kb-offset': kbOffset > 0 ? `${kbOffset}px` : '0px',
    '--kb-transition': kbOffset > 0 ? 'none' : undefined,
  } as CSSProperties), [kbOffset]);

  return (
    <div className={styles.root} data-first-minute={firstMinutePhase}>
      {/* ===== Layer -2: ExperimentBar ===== */}
      <SectionErrorBoundary name="ExperimentBar">
        <ExperimentBar />
      </SectionErrorBoundary>

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
