/**
 * MemoryPanel - 记忆面板
 *
 * 展示灵记住的用户信息，增加信任感和情感连接。
 * 通过 Engine BFF 代理调用 EverMemOS memory_search API。
 */

import { memo, useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api-client';
import { useAuth } from '@/context/auth-context';

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

// ─── Inject hover/active styles once (same pattern as InputBar) ───

const STYLE_ID = 'memory-panel-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ling-mem-close:hover { background: rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.6) !important; }
    .ling-mem-close:active { background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.7) !important; transform: scale(0.9); }
    .ling-memory-card:hover { background: rgba(255,255,255,0.07) !important; border-left-color: rgba(139,92,246,0.55) !important; }
  `;
  document.head.appendChild(style);
}

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
  background: 'rgba(0, 0, 0, 0.4)',
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
  background: 'rgba(10, 0, 21, 0.92)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderLeft: '1px solid rgba(139, 92, 246, 0.2)',
  borderTopLeftRadius: '16px',
  borderBottomLeftRadius: '16px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(139,92,246,0.1)',
  display: 'flex',
  flexDirection: 'column',
};
const S_PANEL_OPEN: CSSProperties = { ...S_PANEL_BASE, animation: 'slideInRight 0.3s ease-out' };
const S_PANEL_CLOSING: CSSProperties = { ...S_PANEL_BASE, animation: `slideOutRight ${EXIT_DURATION}ms ease-in forwards` };

const S_HEADER: CSSProperties = {
  padding: '18px 20px',
  borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'rgba(139, 92, 246, 0.04)',
};
const S_TITLE_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const S_TITLE: CSSProperties = { color: '#fff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.2px' };
const S_BADGE: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'rgba(167,139,250,0.85)',
  background: 'rgba(139,92,246,0.14)', padding: '2px 8px', borderRadius: '8px', fontFamily: 'monospace',
};
const S_SUBTITLE: CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '4px 0 0' };

const S_CLOSE_BTN: CSSProperties = {
  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
  fontSize: '24px', cursor: 'pointer', padding: '10px',
  minWidth: '44px', minHeight: '44px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '8px', transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease', lineHeight: 1,
};

const S_CONTENT: CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: '10px',
};
const S_LOADING: CSSProperties = { textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)' };
const S_ERROR: CSSProperties = { textAlign: 'center', padding: '40px 0', color: 'rgba(248, 113, 113, 0.7)' };

const S_EMPTY_WRAP: CSSProperties = { textAlign: 'center', padding: '60px 20px' };
const S_EMPTY_ICON: CSSProperties = { fontSize: '48px', marginBottom: '16px', opacity: 0.5 };
const S_EMPTY_TITLE: CSSProperties = { color: 'rgba(255,255,255,0.75)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' };
const S_EMPTY_DESC: CSSProperties = { color: 'rgba(255,255,255,0.55)', fontSize: '13px', lineHeight: 1.6 };
const S_EMPTY_DESC_MB: CSSProperties = { ...S_EMPTY_DESC, marginBottom: '16px' };
const S_REGISTER_LINK: CSSProperties = {
  display: 'inline-block', padding: '8px 20px', borderRadius: '12px',
  background: 'rgba(139, 92, 246, 0.5)', color: '#fff',
  fontSize: '13px', fontWeight: 600, textDecoration: 'none', transition: 'opacity 0.2s',
};

const S_CARD: CSSProperties = {
  padding: '14px 16px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(139,92,246,0.35)',
  borderRadius: '12px', transition: 'background 0.2s ease, border-color 0.2s ease', cursor: 'default',
};
const S_CARD_TEXT: CSSProperties = { color: 'rgba(255,255,255,0.88)', fontSize: '13px', lineHeight: 1.7, margin: 0 };
const S_CARD_META: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' };
const S_CARD_DATE: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: '11px' };
const S_CARD_GROUP: CSSProperties = {
  fontSize: '10px', color: 'rgba(167,139,250,0.8)', background: 'rgba(139,92,246,0.12)',
  padding: '2px 7px', borderRadius: '6px', letterSpacing: '0.3px', fontWeight: 500,
};

const S_FOOTER: CSSProperties = {
  padding: '12px 20px', borderTop: '1px solid rgba(139, 92, 246, 0.12)',
  textAlign: 'center', background: 'rgba(139, 92, 246, 0.03)',
};
const S_FOOTER_TEXT: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: '11px' };
const S_FOOTER_BOLD: CSSProperties = { color: 'rgba(196, 181, 253, 0.6)' };

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

// ─── Component ───

export const MemoryPanel = memo(function MemoryPanel({ open, onClose }: MemoryPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchMemories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get<{ memories: MemoryEntry[] }>('/api/memory/list');
      setMemories(data.memories || []);
    } catch (err) {
      setError(t('memory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      setClosing(false);
      fetchMemories();
    }
  }, [open, fetchMemories]);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(closingTimer.current); }, []);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, EXIT_DURATION);
  }, [onClose, closing]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  // ESC to close — handled globally by useKeyboardShortcuts in App.tsx

  if (!open && !closing) return null;

  return (
    <div style={S_OVERLAY} onClick={handleOverlayClick}>
      {/* Backdrop */}
      <div style={closing ? S_BACKDROP_CLOSING : S_BACKDROP_OPEN} />

      {/* Panel */}
      <div style={closing ? S_PANEL_CLOSING : S_PANEL_OPEN}>
        {/* Header */}
        <div style={S_HEADER}>
          <div>
            <div style={S_TITLE_ROW}>
              <h3 style={S_TITLE}>{t('memory.title')}</h3>
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
        </div>

        {/* Content */}
        <div className="ling-memory-scroll" style={S_CONTENT}>
          {loading && (
            <div style={S_LOADING}>{t('memory.loading')}</div>
          )}

          {error && (
            <div style={S_ERROR}>{error}</div>
          )}

          {!user && (
            <div style={S_EMPTY_WRAP}>
              <div style={S_EMPTY_ICON}>{'\uD83D\uDD12'}</div>
              <h4 style={S_EMPTY_TITLE}>{t('memory.guestTitle')}</h4>
              <p style={S_EMPTY_DESC_MB}>{t('memory.guestDesc')}</p>
              <a href="/register" style={S_REGISTER_LINK}>
                {t('memory.registerToUnlock')}
              </a>
            </div>
          )}

          {user && !loading && !error && memories.length === 0 && (
            <div style={S_EMPTY_WRAP}>
              <div style={S_EMPTY_ICON}>{'\uD83E\uDDE0'}</div>
              <h4 style={S_EMPTY_TITLE}>{t('memory.noMemoriesTitle')}</h4>
              <p style={S_EMPTY_DESC}>{t('memory.noMemoriesDesc')}</p>
            </div>
          )}

          {memories.map((memory) => (
            <div key={memory.id} className="ling-memory-card" style={S_CARD}>
              <p style={S_CARD_TEXT}>{memory.content}</p>
              <div style={S_CARD_META}>
                <span style={S_CARD_DATE}>
                  {new Date(memory.created_at).toLocaleDateString(undefined, DATE_OPTS)}
                </span>
                {memory.group_id && (
                  <span style={S_CARD_GROUP}>{memory.group_id}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer: memory info based on plan */}
        <div style={S_FOOTER}>
          <span style={S_FOOTER_TEXT}>
            {user?.plan === 'free'
              ? <>{t('memory.freeExpiry', { interpolation: { escapeValue: false } }).split('<bold>').map((part, i) => {
                  if (i === 0) return part;
                  const [bold, rest] = part.split('</bold>');
                  return <span key={i}><strong style={S_FOOTER_BOLD}>{bold}</strong>{rest}</span>;
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
