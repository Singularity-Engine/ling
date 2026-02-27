import { memo, useRef, useCallback } from 'react';
import styles from './SpatialShareCard.module.css';

interface SpatialShareCardProps {
  content: string;
  timestamp?: string;
  onClose: () => void;
  onShare: () => void;
}

const CARD_WIDTH = 720;
const CARD_HEIGHT = 960;
const BG_COLOR = '#0A0A0F';
const TEXT_COLOR = '#E8E8ED';
const WATERMARK_COLOR = 'rgba(232,232,237,0.3)';

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  maxWidth: number,
  lineHeight: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCard(
  canvas: HTMLCanvasElement,
  content: string,
  timestamp?: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Content — Ling's voice
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '32px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = 'top';

  const padding = 80;
  const maxWidth = CARD_WIDTH - padding * 2;
  const lines = wrapText(ctx, content, padding, maxWidth, 48);
  const startY = (CARD_HEIGHT - lines.length * 48) / 2 - 40;

  lines.forEach((line, i) => {
    ctx.fillText(line, padding, startY + i * 48);
  });

  // Fracture line at bottom
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, CARD_HEIGHT - 140);
  const segments = 8;
  for (let i = 1; i <= segments; i++) {
    const x = padding + (maxWidth / segments) * i;
    const y = CARD_HEIGHT - 140 + (Math.random() * 6 - 3);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Timestamp
  if (timestamp) {
    ctx.fillStyle = WATERMARK_COLOR;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(timestamp, padding, CARD_HEIGHT - 100);
  }

  // Watermark
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('sngxai.com', CARD_WIDTH - padding, CARD_HEIGHT - 60);
}

export const SpatialShareCard = memo(function SpatialShareCard({
  content,
  timestamp,
  onClose,
  onShare,
}: SpatialShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleShare = useCallback(() => {
    if (canvasRef.current) {
      drawCard(canvasRef.current, content, timestamp);
    }
    onShare();
  }, [content, timestamp, onShare]);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Share message">
      <div className={styles.card}>
        <div className={styles.preview}>
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <p className={styles.previewText} data-voice="ling">{content}</p>
        </div>

        <div className={styles.actions}>
          <button className={styles.shareBtn} onClick={handleShare}>
            Share
          </button>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
});
