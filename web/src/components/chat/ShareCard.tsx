import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/utils/track-event";
import { createLogger } from "@/utils/logger";
import styles from "./ShareCard.module.css";

const log = createLogger('ShareCard');

// ─── Privacy detection patterns ───
const PRIVACY_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // US phone
  /\b1[3-9]\d{9}\b/, // Chinese mobile
  /\b0\d{2,3}[-.]?\d{7,8}\b/, // Chinese landline
  /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|court|ct|boulevard|blvd)\b/i, // EN address
  /[\u4e00-\u9fa5]{2,}(省|市|区|县|路|街|号|栋|楼|室|弄|巷)/,  // CN address
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // email
  /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/, // CN ID card
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
];

function mayContainPersonalInfo(text: string): boolean {
  return PRIVACY_PATTERNS.some(re => re.test(text));
}

// ─── Card layout constants ───
const CARD = {
  WIDTH: 720, HEIGHT: 960, DPR: 2,
  AVATAR_SIZE: 80, AVATAR_Y: 120, GLOW_RING_GAP: 8,
  TEXT_PADDING: 60, FONT_SIZE: 24, LINE_HEIGHT: 1.6,
  TEXT_START_Y: 200, MAX_LINES: 10,
  TAG_GAP: 40, BRAND_OFFSET: 60, PARTICLES: 20,
} as const;

// ─── Canvas card rendering (offscreen) ───
async function renderShareCard(
  content: string,
  avatarUrl: string,
  brandUrl: string,
): Promise<Blob> {
  const { WIDTH: W, HEIGHT: H, DPR } = CARD;

  const canvas = new OffscreenCanvas(W * DPR, H * DPR);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  // Background: deep purple gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0015");
  bg.addColorStop(0.5, "#1a0a2e");
  bg.addColorStop(1, "#0d1b2a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle glow particles (decorative)
  for (let i = 0; i < CARD.PARTICLES; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139, 92, 246, ${Math.random() * 0.3 + 0.1})`;
    ctx.fill();
  }

  // Avatar circle with glow
  const avatarX = W / 2;

  // Glow ring
  ctx.beginPath();
  ctx.arc(avatarX, CARD.AVATAR_Y, CARD.AVATAR_SIZE / 2 + CARD.GLOW_RING_GAP, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(139, 92, 246, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Try to load and draw avatar image
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = avatarUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      setTimeout(reject, 3000);
    });
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, CARD.AVATAR_Y, CARD.AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, avatarX - CARD.AVATAR_SIZE / 2, CARD.AVATAR_Y - CARD.AVATAR_SIZE / 2, CARD.AVATAR_SIZE, CARD.AVATAR_SIZE);
    ctx.restore();
  } catch {
    // Fallback: purple circle with initial
    ctx.beginPath();
    ctx.arc(avatarX, CARD.AVATAR_Y, CARD.AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
    ctx.fill();
    ctx.font = "bold 32px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(167, 139, 250, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("灵", avatarX, CARD.AVATAR_Y);
  }

  // Content text
  const maxTextWidth = W - CARD.TEXT_PADDING * 2;
  const lineHeight = CARD.FONT_SIZE * CARD.LINE_HEIGHT;
  ctx.font = `${CARD.FONT_SIZE}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "center";

  // Character-level word wrap (CJK-aware)
  let lines: string[] = [];
  let currentLine = "";
  for (const char of content) {
    if (char === "\n") {
      lines.push(currentLine);
      currentLine = "";
      continue;
    }
    const testLine = currentLine + char;
    if (ctx.measureText(testLine).width > maxTextWidth) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit lines
  if (lines.length > CARD.MAX_LINES) {
    lines = lines.slice(0, CARD.MAX_LINES);
    lines[CARD.MAX_LINES - 1] = lines[CARD.MAX_LINES - 1].slice(0, -1) + "…";
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, CARD.TEXT_START_Y + i * lineHeight);
  }

  // Narrative tag: "灵和我说的"
  const tagY = CARD.TEXT_START_Y + lines.length * lineHeight + CARD.TAG_GAP;
  ctx.font = "italic 16px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(167, 139, 250, 0.6)";
  ctx.fillText("— 灵和我说的", W / 2, tagY);

  // Bottom brand bar
  const barY = H - CARD.BRAND_OFFSET;
  ctx.font = "14px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillText(brandUrl, W / 2, barY);

  return canvas.convertToBlob({ type: "image/png" });
}

// ─── Component ───

interface ActionMenuProps {
  onCopy: () => void;
  onShare: () => void;
  onClose: () => void;
}

const ActionMenu = memo(function ActionMenu({ onCopy, onShare, onClose }: ActionMenuProps) {
  const { t } = useTranslation();
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    // WAI-ARIA menu pattern: ArrowUp/ArrowDown navigate items
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
      const idx = items.indexOf(e.target as HTMLButtonElement);
      if (idx < 0) return;
      const next = e.key === "ArrowDown"
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
  }, [onClose]);

  const setMenuItemRef = useCallback((index: number) => (el: HTMLButtonElement | null) => {
    menuItemsRef.current[index] = el;
  }, []);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={styles.actionMenuBackdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.actionMenu}
        role="menu"
        aria-label={t("share.menuTitle", "Actions")}
        onKeyDown={handleKeyDown}
      >
        <button ref={(el) => { firstRef.current = el; menuItemsRef.current[0] = el; }} className={styles.actionMenuItem} role="menuitem" onClick={onCopy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {t("chat.copy", "Copy")}
        </button>
        <button ref={setMenuItemRef(1)} className={styles.actionMenuItem} role="menuitem" onClick={onShare}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          {t("share.shareCard", "Share as card")}
        </button>
        <button ref={setMenuItemRef(2)} className={styles.actionMenuCancel} role="menuitem" onClick={onClose}>
          {t("ui.cancel", "Cancel")}
        </button>
      </div>
    </>
  );
});

interface ShareCardProps {
  content: string;
  isOpen: boolean;
  onClose: () => void;
  mode: "menu" | "preview";
  onModeChange: (mode: "menu" | "preview") => void;
  /** Ref to the element that triggered the menu — focus returns here on close */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const ShareCard = memo(function ShareCard({ content, isOpen, onClose, mode, onModeChange, triggerRef }: ShareCardProps) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const privacyResolveRef = useRef<((proceed: boolean) => void) | null>(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Return focus to trigger element on close
  const handleClose = useCallback(() => {
    onClose();
    // Defer focus to after React re-render completes
    requestAnimationFrame(() => {
      triggerRef?.current?.focus();
    });
  }, [onClose, triggerRef]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    trackEvent("share_copy", { source: "action_menu" });
    handleClose();
  }, [content, handleClose]);

  const resolvePrivacy = useCallback((proceed: boolean) => {
    privacyResolveRef.current?.(proceed);
    privacyResolveRef.current = null;
  }, []);

  const handleShare = useCallback(async () => {
    // Privacy check — require user confirmation
    if (mayContainPersonalInfo(content)) {
      setShowPrivacyWarning(true);
      const proceed = await new Promise<boolean>(resolve => {
        privacyResolveRef.current = resolve;
      });
      setShowPrivacyWarning(false);
      if (!proceed) return;
    }

    setGenerating(true);
    onModeChange("preview");

    try {
      const blob = await renderShareCard(
        content,
        "/avatar-ling.png",
        "ling.sngxai.com",
      );

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setImageUrl(url);
      trackEvent("share_card_generated");
    } catch (err) {
      log.error("Failed to generate share card:", err);
    } finally {
      setGenerating(false);
    }
  }, [content, onModeChange]);

  const handleSave = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `ling-share-${Date.now()}.png`;
    a.click();
    trackEvent("share_card_saved");
  }, [imageUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!imageUrl || !blobUrlRef.current) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "ling-share.png", { type: "image/png" });
      if (navigator.share) {
        await navigator.share({
          title: t("share.cardTitle", "Ling said..."),
          files: [file],
        });
        trackEvent("share_card_shared", { method: "native" });
      }
    } catch {
      // User cancelled or not supported
    }
  }, [imageUrl, t]);

  if (!isOpen) return null;

  if (mode === "menu") {
    return (
      <>
        <ActionMenu onCopy={handleCopy} onShare={handleShare} onClose={handleClose} />
        {showPrivacyWarning && (
          <div className={styles.privacyWarning} role="alertdialog" aria-label={t("share.privacyWarning")}>
            <span>{t("share.privacyWarning", "This message may contain personal information. Please review before sharing.")}</span>
            <div className={styles.privacyActions}>
              <button className={styles.privacyConfirmBtn} onClick={() => resolvePrivacy(true)}>
                {t("share.continueShare", "Continue")}
              </button>
              <button className={styles.privacyCancelBtn} onClick={() => resolvePrivacy(false)}>
                {t("ui.cancel", "Cancel")}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Preview mode
  return (
    <div className={styles.cardPreview}>
      <button className={styles.cardCloseBtn} onClick={handleClose} aria-label={t("ui.close", "Close")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      {generating ? (
        <div className={styles.generating}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "sendSpin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {t("share.generating", "Generating...")}
        </div>
      ) : imageUrl ? (
        <>
          <img src={imageUrl} alt={t("share.cardAlt", "Share card")} className={styles.cardImage} />
          <div className={styles.cardActions}>
            <button className={styles.cardSaveBtn} onClick={handleSave}>
              {t("share.save", "Save")}
            </button>
            {typeof navigator.share === "function" && (
              <button className={styles.cardShareBtn} onClick={handleNativeShare}>
                {t("share.share", "Share")}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
});

ShareCard.displayName = "ShareCard";
