/**
 * MemoryPanel - 记忆面板
 *
 * 展示灵记住的用户信息，增加信任感和情感连接。
 * 通过 Engine BFF 代理调用 EverMemOS memory_search API。
 */

import { memo, useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api-client';
import { useAuthState } from '@/context/AuthContext';
// Hover styles moved to static index.css — no runtime injection needed.

interface MemoryEntry {
  id: string;
  content: string;
  created_at: string;
  group_id?: string;
}

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
}

const EXIT_DURATION = 250; // ms — matches slideOutRight animation

// ─── Static style constants (avoid per-render allocation) ───

const S_OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  display: 'flex',
  justifyContent: 'flex-end',
};

const S_BACKDROP_BASE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--ling-overlay-backdrop)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  transition: `opacity ${EXIT_DURATION}ms ease`,
};
const S_BACKDROP_OPEN: CSSProperties = { ...S_BACKDROP_BASE, opacity: 1 };
const S_BACKDROP_CLOSING: CSSProperties = { ...S_BACKDROP_BASE, opacity: 0 };

const S_PANEL_BASE: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 'min(400px, 100vw)',
  height: '100%',
  background: 'var(--ling-surface-deep)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderLeft: '1px solid var(--ling-purple-20)',
  borderTopLeftRadius: '16px',
  borderBottomLeftRadius: '16px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 24px var(--ling-purple-08)',
  display: 'flex',
  flexDirection: 'column',
};
const S_PANEL_OPEN: CSSProperties = { ...S_PANEL_BASE, animation: 'slideInRight 0.3s ease-out' };
const S_PANEL_CLOSING: CSSProperties = { ...S_PANEL_BASE, animation: `slideOutRight ${EXIT_DURATION}ms ease-in forwards` };

const S_HEADER: CSSProperties = {
  padding: '18px 20px',
  borderBottom: '1px solid var(--ling-purple-15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'var(--ling-purple-05)',
};
const S_TITLE_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const S_TITLE: CSSProperties = { color: 'var(--ling-text-primary)', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.2px' };
const S_BADGE: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--ling-purple-light)',
  background: 'var(--ling-purple-15)', padding: '2px 8px', borderRadius: '8px', fontFamily: 'monospace',
};
const S_SUBTITLE: CSSProperties = { color: 'var(--ling-text-dim)', fontSize: '12px', margin: '4px 0 0' };

const S_CLOSE_BTN: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--ling-text-tertiary)',
  fontSize: '24px', cursor: 'pointer', padding: '10px',
  minWidth: '44px', minHeight: '44px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '8px', transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease', lineHeight: 1,
};

const S_CONTENT: CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: '10px',
};
const S_LOADING: CSSProperties = {
  textAlign: 'center', padding: '40px 0', color: 'var(--ling-text-tertiary)',
  animation: 'memLoadPulse 1.5s ease-in-out infinite',
};
const S_ERROR: CSSProperties = {
  textAlign: 'center', padding: '40px 0', color: 'var(--ling-error)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
};
const S_RETRY_BTN: CSSProperties = {
  padding: '6px 18px', fontSize: '12px', fontWeight: 600,
  color: 'var(--ling-error)', background: 'var(--ling-error-bg)',
  border: '1px solid var(--ling-error-border)', borderRadius: '8px',
  cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease',
};

const S_EMPTY_WRAP: CSSProperties = { textAlign: 'center', padding: '60px 20px' };
const S_EMPTY_ICON: CSSProperties = { fontSize: '48px', marginBottom: '16px', opacity: 0.5 };
const S_EMPTY_TITLE: CSSProperties = { color: 'var(--ling-text-secondary)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' };
const S_EMPTY_DESC: CSSProperties = { color: 'var(--ling-text-dim)', fontSize: '13px', lineHeight: 1.6 };
const S_EMPTY_DESC_MB: CSSProperties = { ...S_EMPTY_DESC, marginBottom: '16px' };
const S_REGISTER_LINK: CSSProperties = {
  display: 'inline-block', padding: '8px 20px', borderRadius: '12px',
  background: 'var(--ling-purple-50)', color: 'var(--ling-text-primary)',
  fontSize: '13px', fontWeight: 600, textDecoration: 'none', transition: 'opacity 0.2s',
};

const S_CARD_BASE: CSSProperties = {
  padding: '14px 16px', background: 'var(--ling-overlay-4)',
  border: '1px solid var(--ling-surface-border)', borderLeft: '3px solid var(--ling-purple-30)',
  borderRadius: '12px', transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.2s ease', cursor: 'default',
};

// Cached per-index card styles with staggered entrance animation (capped at 12 to avoid excessive delays)
const _cardStyleCache = new Map<number, CSSProperties>();
function getCardStyle(index: number): CSSProperties {
  let s = _cardStyleCache.get(index);
  if (!s) {
    const delay = Math.min(index, 12) * 0.04;
    s = { ...S_CARD_BASE, animation: `memCardIn 0.35s ease-out ${delay}s both` };
    _cardStyleCache.set(index, s);
  }
  return s;
}
const S_CARD_TEXT: CSSProperties = { color: 'var(--ling-text-primary)', fontSize: '13px', lineHeight: 1.7, margin: 0 };
const S_CARD_META: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' };
const S_CARD_DATE: CSSProperties = { color: 'var(--ling-text-tertiary)', fontSize: '11px' };
const S_CARD_GROUP: CSSProperties = {
  fontSize: '10px', color: 'var(--ling-purple-light)', background: 'var(--ling-purple-12)',
  padding: '2px 7px', borderRadius: '6px', letterSpacing: '0.3px', fontWeight: 500,
};

const S_FOOTER: CSSProperties = {
  padding: '12px 20px', borderTop: '1px solid var(--ling-purple-12)',
  textAlign: 'center', background: 'var(--ling-purple-05)',
};
const S_FOOTER_TEXT: CSSProperties = { color: 'var(--ling-text-tertiary)', fontSize: '11px' };
const S_FOOTER_BOLD: CSSProperties = { color: 'var(--ling-purple-60)' };

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

// ─── MemoryCard (memo'd to avoid re-render when parent state changes) ───

interface MemoryCardProps {
  memory: MemoryEntry;
  index: number;
  formattedDate: string | undefined;
}

const MemoryCard = memo(function MemoryCard({ memory, index, formattedDate }: MemoryCardProps) {
  return (
    <div className="ling-memory-card" style={getCardStyle(index)}>
      <p style={S_CARD_TEXT}>{memory.content}</p>
      <div style={S_CARD_META}>
        <span style={S_CARD_DATE}>{formattedDate}</span>
        {memory.group_id && (
          <span style={S_CARD_GROUP}>{memory.group_id}</span>
        )}
      </div>
    </div>
  );
});

// ─── Component ───

export const MemoryPanel = memo(function MemoryPanel({ open, onClose }: MemoryPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuthState();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus-trap: keep Tab/Shift+Tab within the panel
  useFocusTrap(panelRef, open && !closing);

  const abortRef = useRef<AbortController>();

  const fetchMemories = useCallback(() => {
    if (!user) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError('');

    apiClient.get<{ memories: MemoryEntry[] }>('/api/memory/list', ac.signal)
      .then(data => { setMemories(data.memories || []); })
      .catch(() => { if (!ac.signal.aborted) setError(t('memory.loadError')); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [user, t]);

  useEffect(() => {
    if (!open || !user) return;
    setClosing(false);
    fetchMemories();
    return () => { abortRef.current?.abort(); };
  }, [open, user, fetchMemories]);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  // Ref mirror — lets handleClose read the latest `closing` without depending
  // on it, keeping the callback stable across closing-state transitions and
  // avoiding cascading re-creation of handleOverlayClick.
  const closingRef = useRef(closing);
  closingRef.current = closing;

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, EXIT_DURATION);
  }, [onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  // Pre-compute formatted dates so we don't call new Date() + toLocaleDateString()
  // for every card on every re-render (e.g. closing animation triggers re-render).
  const formattedDates = useMemo(
    () => new Map(memories.map(m => [m.id, new Date(m.created_at).toLocaleDateString(undefined, DATE_OPTS)])),
    [memories],
  );

  // ESC to close — handled globally by useKeyboardShortcuts in App.tsx

  if (!open && !closing) return null;

  return (
    <div style={S_OVERLAY} onClick={handleOverlayClick}>
      {/* Backdrop */}
      <div style={closing ? S_BACKDROP_CLOSING : S_BACKDROP_OPEN} aria-hidden="true" />

      {/* Panel */}
      <div ref={panelRef} style={closing ? S_PANEL_CLOSING : S_PANEL_OPEN} role="dialog" aria-modal="true" aria-labelledby="memory-panel-title">
        {/* Header */}
        <header style={S_HEADER}>
          <div>
            <div style={S_TITLE_ROW}>
              <h3 id="memory-panel-title" style={S_TITLE}>{t('memory.title')}</h3>
              {memories.length > 0 && (
                <span style={S_BADGE}>{memories.length}</span>
              )}
            </div>
            <p style={S_SUBTITLE}>{t('memory.subtitle')}</p>
          </div>
          <button
            className="ling-mem-close"
            onClick={handleClose}
            aria-label={t('common.close')}
            style={S_CLOSE_BTN}
          >
            ×
          </button>
        </header>

        {/* Content */}
        <div className="ling-memory-scroll" style={S_CONTENT}>
          {loading && (
            <div style={S_LOADING} role="status" aria-live="polite">{t('memory.loading')}</div>
          )}

          {error && (
            <div style={S_ERROR} role="alert">
              <span>{error}</span>
              <button type="button" style={S_RETRY_BTN} onClick={fetchMemories}>
                {t('chat.retry')}
              </button>
            </div>
          )}

          {!user && (
            <div style={S_EMPTY_WRAP}>
              <div style={S_EMPTY_ICON} role="img" aria-label={t('memory.guestTitle')}>{'\uD83D\uDD12'}</div>
              <h4 style={S_EMPTY_TITLE}>{t('memory.guestTitle')}</h4>
              <p style={S_EMPTY_DESC_MB}>{t('memory.guestDesc')}</p>
              <a href="/register" style={S_REGISTER_LINK}>
                {t('memory.registerToUnlock')}
              </a>
            </div>
          )}

          {user && !loading && !error && memories.length === 0 && (
            <div style={S_EMPTY_WRAP}>
              <div style={S_EMPTY_ICON} role="img" aria-label={t('memory.noMemoriesTitle')}>{'\uD83E\uDDE0'}</div>
              <h4 style={S_EMPTY_TITLE}>{t('memory.noMemoriesTitle')}</h4>
              <p style={S_EMPTY_DESC}>{t('memory.noMemoriesDesc')}</p>
            </div>
          )}

          {memories.map((memory, i) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              index={i}
              formattedDate={formattedDates.get(memory.id)}
            />
          ))}
        </div>

        {/* Footer: memory info based on plan */}
        <div style={S_FOOTER}>
          <span style={S_FOOTER_TEXT}>
            {user?.plan === 'free'
              ? <>{t('memory.freeExpiry', { interpolation: { escapeValue: false } }).split('<bold>').map((part, i) => {
                  if (i === 0) return part;
                  const [bold, rest] = part.split('</bold>');
                  return <span key={`expiry-${bold}`}><strong style={S_FOOTER_BOLD}>{bold}</strong>{rest}</span>;
                })}</>
              : user?.plan === 'stardust'
                ? t('memory.stardustExpiry')
                : t('memory.permanentMemory')}
          </span>
        </div>
      </div>
    </div>
  );
});
