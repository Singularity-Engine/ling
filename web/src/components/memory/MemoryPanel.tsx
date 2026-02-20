/**
 * MemoryPanel - 记忆面板
 *
 * 展示灵记住的用户信息，增加信任感和情感连接。
 * 通过 Engine BFF 代理调用 EverMemOS memory_search API。
 */

import { useState, useEffect, useCallback } from 'react';
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
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMemories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get<{ memories: MemoryEntry[] }>(
        '/api/billing/balance', // Reuse balance endpoint for now — we'll add a memory endpoint later
      );
      // For now, show a placeholder until memory API is available
      setMemories([]);
    } catch (err) {
      setError('Could not load memories');
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
          maxWidth: '380px',
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
              Memories
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '4px 0 0' }}>
              Things I remember about you
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
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
              Loading memories...
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(248, 113, 113, 0.7)' }}>
              {error}
            </div>
          )}

          {!loading && !error && memories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
                {'\uD83E\uDDE0'}
              </div>
              <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                No memories yet
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: 1.6 }}>
                As we chat, I'll remember the important things you tell me — your name, interests, and what matters to you.
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
              ? 'Free plan: memories expire after 7 days. Upgrade to keep them forever.'
              : user?.plan === 'stardust'
                ? 'Stardust plan: memories kept for 90 days.'
                : 'Your memories are permanent.'}
          </span>
        </div>
      </div>
    </div>
  );
}
