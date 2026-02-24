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
import { OVERLAY_COLORS, WHITE_ALPHA } from "@/constants/colors";

const ChatArea = lazy(() => import("../chat/ChatArea").then(m => ({ default: m.ChatArea })));
const Constellation = lazy(() => import("../ability/Constellation").then(m => ({ default: m.Constellation })));

// ─── Inline style constants ───────────────────────────────────────────────────

const S_ROOT: CSSProperties = {
  position: "relative", height: "100dvh", width: "100vw",
  background: "var(--ling-bg-deep)", overflow: "hidden",
};
const S_LAYER_STARFIELD: CSSProperties = { position: "absolute", inset: 0, zIndex: -1, contain: "strict" };
const S_LAYER_LIVE2D: CSSProperties = { position: "absolute", inset: 0, zIndex: 0, contain: "strict" };
const S_LAYER_EFFECTS: CSSProperties = { position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden", contain: "strict" };

const S_GROUND_GRADIENT: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0,
  height: "58dvh", zIndex: 22, pointerEvents: "none", contain: "strict",
  background: "linear-gradient(to bottom, transparent 0%, rgba(10,0,21,0.02) 12%, rgba(10,0,21,0.07) 24%, rgba(10,0,21,0.16) 36%, rgba(10,0,21,0.28) 48%, rgba(10,0,21,0.42) 60%, rgba(10,0,21,0.56) 72%, rgba(10,0,21,0.68) 84%, rgba(10,0,21,0.78) 94%, rgba(10,0,21,0.82) 100%)",
};

const S_TOOLBAR_D: CSSProperties = {
  position: "absolute", top: "52px", right: "12px", zIndex: 20,
  display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
};
const _GROUP_BASE: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "6px", borderRadius: "20px",
  background: OVERLAY_COLORS.LIGHT, border: `1px solid ${WHITE_ALPHA.LIGHT_BORDER}`,
};
const S_GROUP_D: CSSProperties = { ..._GROUP_BASE, gap: "6px" };

const S_TOOLBAR_DIVIDER: CSSProperties = {
  width: "24px", height: "1px",
  background: "rgba(255,255,255,0.08)",
  margin: "4px 0",
};

const S_MOBILE_TRIGGER: CSSProperties = {
  position: "absolute",
  top: "max(44px, calc(env(safe-area-inset-top, 0px) + 36px))",
  right: "max(8px, env(safe-area-inset-right, 0px))",
  zIndex: 20,
  display: "flex", alignItems: "center", gap: "6px",
};

const MENU_EXIT_MS = 250;

const S_MENU_BACKDROP: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 50,
  background: "rgba(0,0,0,0.4)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  transition: `opacity ${MENU_EXIT_MS}ms ease`,
  touchAction: "none",
};

const S_MOBILE_MENU: CSSProperties = {
  position: "fixed", top: 0, right: 0, bottom: 0,
  width: "min(260px, 75vw)", zIndex: 51,
  background: "rgba(10, 0, 21, 0.94)",
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  borderLeft: `1px solid ${WHITE_ALPHA.LIGHT_BORDER}`,
  display: "flex", flexDirection: "column",
  animation: "slideInRight 0.25s ease-out",
  overscrollBehavior: "contain",
};
const S_MOBILE_MENU_CLOSING: CSSProperties = {
  ...S_MOBILE_MENU,
  animation: `slideOutRight ${MENU_EXIT_MS}ms ease-in forwards`,
};

const S_MENU_BADGE: CSSProperties = {
  position: "absolute", top: "4px", right: "4px",
  width: "8px", height: "8px", borderRadius: "50%",
  background: "var(--ling-error)",
  border: "2px solid rgba(10, 0, 21, 0.8)",
  pointerEvents: "none",
};

const S_MENU_HEADER: CSSProperties = {
  display: "flex", justifyContent: "flex-end",
  padding: "max(48px, calc(env(safe-area-inset-top, 0px) + 40px)) 12px 8px",
};

const S_MENU_STATUS: CSSProperties = {
  display: "flex", alignItems: "center", gap: "8px",
  padding: "8px 12px", flexWrap: "wrap",
};

const S_MENU_ITEM: CSSProperties = {
  display: "flex", alignItems: "center", gap: "12px",
  padding: "14px 16px", borderRadius: "12px",
  background: "transparent", border: "none",
  color: "rgba(255,255,255,0.7)", fontSize: 15,
  cursor: "pointer", width: "100%", textAlign: "left" as const,
  fontFamily: "inherit",
  transition: "background 0.15s ease",
};

const S_MENU_SEP: CSSProperties = {
  height: 1, background: "rgba(255,255,255,0.06)",
  margin: "4px 12px",
};

const _ACTION_BTN: CSSProperties = {
  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "background 0.3s ease, border-color 0.3s ease, transform 0.12s ease, opacity 0.12s ease",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: 0,
};
const S_BTN_D_OFF: CSSProperties = { ..._ACTION_BTN, width: "42px", height: "42px", background: WHITE_ALPHA.BUTTON_BG, border: `1px solid ${WHITE_ALPHA.BORDER}` };
const S_BTN_D_ON: CSSProperties = { ..._ACTION_BTN, width: "42px", height: "42px", background: "var(--ling-purple-40)", border: "1px solid var(--ling-purple-60)" };
const S_BTN_M_OFF: CSSProperties = { ..._ACTION_BTN, width: "44px", height: "44px", background: WHITE_ALPHA.BUTTON_BG, border: `1px solid ${WHITE_ALPHA.BORDER}` };
const S_BTN_M_ON: CSSProperties = { ..._ACTION_BTN, width: "44px", height: "44px", background: "var(--ling-purple-40)", border: "1px solid var(--ling-purple-60)" };
function btnStyle(mobile: boolean, active: boolean): CSSProperties {
  if (mobile) return active ? S_BTN_M_ON : S_BTN_M_OFF;
  return active ? S_BTN_D_ON : S_BTN_D_OFF;
}

const _CHAT_INNER: CSSProperties = {
  overflow: "hidden", position: "relative", pointerEvents: "auto",
  transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  willChange: "max-height, opacity",
  maskImage: "linear-gradient(to bottom, transparent 0%, black 25%)",
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 25%)",
};
const S_CHAT_D_OPEN: CSSProperties = { ..._CHAT_INNER, maxHeight: "40dvh", opacity: 1 };
const S_CHAT_M_OPEN: CSSProperties = { ..._CHAT_INNER, maxHeight: "50dvh", opacity: 1 };
const S_CHAT_CLOSED: CSSProperties = { ..._CHAT_INNER, maxHeight: "0px", opacity: 0 };
function chatInnerStyle(mobile: boolean, expanded: boolean): CSSProperties {
  if (!expanded) return S_CHAT_CLOSED;
  return mobile ? S_CHAT_M_OPEN : S_CHAT_D_OPEN;
}

const S_CHAT_OUTER_BASE: CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25,
  display: "flex", flexDirection: "column", pointerEvents: "none",
};

const S_EXPAND_HANDLE: CSSProperties = {
  pointerEvents: "auto", display: "flex", justifyContent: "center",
  padding: "6px 0", cursor: "pointer",
};

const S_INPUT_SECTION: CSSProperties = { flexShrink: 0, pointerEvents: "auto", position: "relative" as const };
const S_CONSTELLATION_POS: CSSProperties = {
  position: "absolute", bottom: "calc(100% + 12px)", left: 16, zIndex: 26, pointerEvents: "auto",
};
const S_INPUT_BAR_BG: CSSProperties = {
  background: "rgba(10, 0, 21, 0.55)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
  borderTop: "1px solid var(--ling-purple-15)",
};

const S_FALLBACK_CHAT: CSSProperties = { padding: "16px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 };
const S_FALLBACK_INPUT: CSSProperties = { padding: "12px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center" };

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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OverlayLayoutProps {
  isMobile: boolean;
  chatExpanded: boolean;
  kbOffset: number;
  menuOpen: boolean;
  menuClosing: boolean;
  showCreditsBadge: boolean;
  memoryActive: boolean;
  aboutActive: boolean;
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
  memoryActive,
  aboutActive,
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

  const chatOuterStyle = useMemo<CSSProperties>(() => ({
    ...S_CHAT_OUTER_BASE,
    transform: kbOffset > 0 ? `translateY(-${kbOffset}px)` : "none",
    transition: kbOffset > 0 ? "none" : "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  }), [kbOffset]);

  return (
    <div style={S_ROOT} data-first-minute={firstMinutePhase}>
      {/* ===== Layer -2: ExperimentBar ===== */}
      <SectionErrorBoundary name="ExperimentBar">
        <ExperimentBar />
      </SectionErrorBoundary>

      {/* ===== Layer -1: StarField ===== */}
      <div style={S_LAYER_STARFIELD}>
        <StarField />
      </div>

      {/* ===== Layer 0: Live2D ===== */}
      <SectionErrorBoundary name="Live2D">
        <div style={S_LAYER_LIVE2D}>
          <Live2D />
        </div>
      </SectionErrorBoundary>

      {/* ===== Layer 0+: TapParticles ===== */}
      <TapParticles />

      {/* ===== Layer 0.5: Effects ===== */}
      <SectionErrorBoundary name="Effects">
        <div style={S_LAYER_EFFECTS}>
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
      <div style={S_GROUND_GRADIENT} />

      {/* ===== Layer 1.5: Toolbar ===== */}
      {isMobile ? (
        /* ── Mobile: connection dot + chat toggle + hamburger ── */
        <div style={S_MOBILE_TRIGGER}>
          <SectionErrorBoundary name="StatusGroup">
            <ConnectionStatus />
          </SectionErrorBoundary>
          <button
            className="ling-action-btn"
            data-active={chatExpanded}
            onClick={toggleChat}
            aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
            aria-pressed={chatExpanded}
            style={btnStyle(true, chatExpanded)}
          >
            {ICON_CHAT}
          </button>
          <button
            ref={hamburgerRef}
            className="ling-action-btn"
            onClick={openMenu}
            aria-label={t("ui.menu", "Menu")}
            aria-expanded={menuOpen || menuClosing}
            aria-haspopup="dialog"
            style={{ ...btnStyle(true, menuOpen || menuClosing), position: "relative" as const }}
          >
            {ICON_MENU}
            {showCreditsBadge && <div style={S_MENU_BADGE} />}
          </button>
        </div>
      ) : (
        /* ── Tablet: unified capsule (non-split desktop) ── */
        <div style={S_TOOLBAR_D}>
          <SectionErrorBoundary name="Toolbar">
            <div style={S_GROUP_D}>
              <CreditsDisplay />
              <AffinityBadge />
              <ConnectionStatus />
              <div style={S_TOOLBAR_DIVIDER} />
              <button
                className="ling-action-btn"
                data-active={chatExpanded}
                onClick={toggleChat}
                aria-label={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
                aria-pressed={chatExpanded}
                title={chatExpanded ? t("ui.collapseChat") : t("ui.expandChat")}
                style={btnStyle(false, chatExpanded)}
              >
                {ICON_CHAT}
              </button>
              <button
                className="ling-action-btn"
                data-active={memoryActive}
                onClick={openMemory}
                aria-label={t("memory.title")}
                title={t("memory.title")}
                style={btnStyle(false, memoryActive)}
              >
                {ICON_MEMORY}
              </button>
              <button
                className="ling-action-btn"
                data-active={aboutActive}
                onClick={openAbout}
                aria-label={t("shortcuts.showAbout")}
                title={t("shortcuts.showAbout")}
                style={btnStyle(false, aboutActive)}
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
            style={{ ...S_MENU_BACKDROP, opacity: menuClosing ? 0 : 1, animation: menuClosing ? undefined : "pageFadeIn 0.2s ease-out" }}
            onClick={closeMenu}
          />
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div
            ref={menuPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("ui.menu", "Menu")}
            style={menuClosing ? S_MOBILE_MENU_CLOSING : S_MOBILE_MENU}
            onKeyDown={handleMenuKeyDown}
          >
            <div style={S_MENU_HEADER}>
              <button
                className="ling-action-btn"
                onClick={closeMenu}
                aria-label={t("ui.close", "Close")}
                style={btnStyle(true, false)}
                autoFocus
              >
                {ICON_CLOSE}
              </button>
            </div>
            <SectionErrorBoundary name="MenuStatus">
              <div style={S_MENU_STATUS}>
                <CreditsDisplay />
                <AffinityBadge />
                <ConnectionStatus />
              </div>
            </SectionErrorBoundary>
            <div style={S_MENU_SEP} />
            <button
              className="ling-menu-item"
              style={S_MENU_ITEM}
              onClick={() => { openMemory(); closeMenu(); }}
            >
              {ICON_MEMORY}
              <span>{t("memory.title")}</span>
            </button>
            <button
              className="ling-menu-item"
              style={S_MENU_ITEM}
              onClick={() => { openAbout(); closeMenu(); }}
            >
              {ICON_INFO}
              <span>{t("shortcuts.showAbout")}</span>
            </button>
          </div>
        </>
      )}

      {/* ===== Layer 2: Floating chat area ===== */}
      <div style={chatOuterStyle}>
        <div style={chatInnerStyle(isMobile, chatExpanded)}>
          <SectionErrorBoundary name="ChatArea" fallback={
            <div style={S_FALLBACK_CHAT}>{t("error.chatRenderFailed")}</div>
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
            style={S_EXPAND_HANDLE}
            onClick={toggleChat}
            onKeyDown={handleExpandKeyDown}
          >
            {ICON_CHEVRON_UP}
          </div>
        )}

        <div style={S_INPUT_SECTION}>
          {/* Constellation — floats above InputBar (lazy: defers framer-motion chunk) */}
          {!isMobile && (
            <SectionErrorBoundary name="Constellation">
              <div style={S_CONSTELLATION_POS}>
                <Suspense fallback={null}>
                  <Constellation />
                </Suspense>
              </div>
            </SectionErrorBoundary>
          )}
          <SectionErrorBoundary name="InputBar" fallback={
            <div style={S_INPUT_BAR_BG}>
              <div style={S_FALLBACK_INPUT}>{i18next.t("error.inputBarFailed")}</div>
            </div>
          }>
            <div style={S_INPUT_BAR_BG}>
              <InputBar />
            </div>
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
});
