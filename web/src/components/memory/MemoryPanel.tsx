/**
 * MemoryPanel - 记忆面板
 *
 * 展示灵记住的用户信息，增加信任感和情感连接。
 * 通过 Engine BFF 代理调用 EverMemOS memory_search API。
 */

import { useState, useEffect, useCallback } from 'react';
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

export function MemoryPanel({ open, onClose }: MemoryPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (open) fetchMemories();
  }, [open, fetchMemories]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

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
        if (e.target === e.currentTarget) onClose();
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
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'min(380px, 100vw)',
          height: '100%',
          background: 'rgba(20, 8, 40, 0.98)',
          borderLeft: '1px solid rgba(139, 92, 246, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              {t('memory.title')}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '4px 0 0' }}>
              {t('memory.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
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
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
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
              <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                {t('memory.guestTitle')}
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
                {t('memory.guestDesc')}
              </p>
              <a
                href="/register"
                style={{
                  display: 'inline-block',
                  padding: '8px 20px',
                  borderRadius: '10px',
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
              <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                {t('memory.noMemoriesTitle')}
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: 1.6 }}>
                {t('memory.noMemoriesDesc')}
              </p>
            </div>
          )}

          {memories.map((memory) => (
            <div
              key={memory.id}
              style={{
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                marginBottom: '8px',
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
                {memory.content}
              </p>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', marginTop: '6px', display: 'block' }}>
                {new Date(memory.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                {memory.group_id && (
                  <span style={{ marginLeft: '8px', color: 'rgba(139,92,246,0.4)' }}>
                    #{memory.group_id}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Footer: memory info based on plan */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>
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
