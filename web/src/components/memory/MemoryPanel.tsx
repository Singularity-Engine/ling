/**
 * MemoryPanel - 记忆面板
 *
 * 展示灵记住的用户信息，增加信任感和情感连接。
 * 通过 Engine BFF 代理调用 EverMemOS memory_search API。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function MemoryPanel({ open, onClose }: MemoryPanelProps) {
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

  // ESC to close — handled globally by useKeyboardShortcuts in App.tsx

  if (!open && !closing) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: closing ? 0 : 1,
          transition: `opacity ${EXIT_DURATION}ms ease`,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'min(380px, 100vw)',
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
          animation: closing
            ? `slideOutRight ${EXIT_DURATION}ms ease-in forwards`
            : 'slideInRight 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(139, 92, 246, 0.04)',
          }}
        >
          <div>
            <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.2px' }}>
              {t('memory.title')}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', margin: '4px 0 0' }}>
              {t('memory.subtitle')}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '10px',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              transition: 'all 0.15s ease',
              lineHeight: 1,
            }}
            onPointerDown={(e) => {
              const btn = e.currentTarget;
              btn.style.background = 'rgba(255,255,255,0.08)';
              btn.style.color = 'rgba(255,255,255,0.7)';
              btn.style.transform = 'scale(0.9)';
            }}
            onPointerUp={(e) => {
              const btn = e.currentTarget;
              btn.style.background = 'none';
              btn.style.color = 'rgba(255,255,255,0.4)';
              btn.style.transform = '';
            }}
            onPointerLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.background = 'none';
              btn.style.color = 'rgba(255,255,255,0.4)';
              btn.style.transform = '';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          className="ling-memory-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)' }}>
              {t('memory.loading')}
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(248, 113, 113, 0.7)' }}>
              {error}
            </div>
          )}

          {!user && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
                {'\uD83D\uDD12'}
              </div>
              <h4 style={{ color: 'rgba(255,255,255,0.75)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                {t('memory.guestTitle')}
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
                {t('memory.guestDesc')}
              </p>
              <a
                href="/register"
                style={{
                  display: 'inline-block',
                  padding: '8px 20px',
                  borderRadius: '12px',
                  background: 'rgba(139, 92, 246, 0.5)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'opacity 0.2s',
                }}
              >
                {t('memory.registerToUnlock')}
              </a>
            </div>
          )}

          {user && !loading && !error && memories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
                {'\uD83E\uDDE0'}
              </div>
              <h4 style={{ color: 'rgba(255,255,255,0.75)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                {t('memory.noMemoriesTitle')}
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', lineHeight: 1.6 }}>
                {t('memory.noMemoriesDesc')}
              </p>
            </div>
          )}

          {memories.map((memory) => (
            <div
              key={memory.id}
              className="ling-memory-card"
              style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '3px solid rgba(139,92,246,0.4)',
                borderRadius: '12px',
                transition: 'background 0.2s ease, border-color 0.2s ease',
                cursor: 'default',
              }}
              onPointerEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = 'rgba(255,255,255,0.08)';
                el.style.borderLeftColor = 'rgba(139,92,246,0.6)';
              }}
              onPointerLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = 'rgba(255,255,255,0.05)';
                el.style.borderLeftColor = 'rgba(139,92,246,0.4)';
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '14px', lineHeight: 1.65, margin: 0 }}>
                {memory.content}
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                  {new Date(memory.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {memory.group_id && (
                  <span style={{
                    fontSize: '11px',
                    color: 'rgba(167,139,250,0.85)',
                    background: 'rgba(139,92,246,0.14)',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    letterSpacing: '0.3px',
                    fontWeight: 500,
                  }}>
                    {memory.group_id}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer: memory info based on plan */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgba(139, 92, 246, 0.15)',
            textAlign: 'center',
            background: 'rgba(139, 92, 246, 0.04)',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
            {user?.plan === 'free'
              ? <>{t('memory.freeExpiry', { interpolation: { escapeValue: false } }).split('<bold>').map((part, i) => {
                  if (i === 0) return part;
                  const [bold, rest] = part.split('</bold>');
                  return <span key={i}><strong style={{ color: 'rgba(196, 181, 253, 0.6)' }}>{bold}</strong>{rest}</span>;
                })}</>
              : user?.plan === 'stardust'
                ? t('memory.stardustExpiry')
                : t('memory.permanentMemory')}
          </span>
        </div>
      </div>
    </div>
  );
}
