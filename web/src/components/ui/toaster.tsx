'use client';

import type { CSSProperties } from 'react';
import { useState, useEffect } from 'react';

// 简单的 toast 系统，不依赖 Chakra UI
interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  type?: 'info' | 'success' | 'error' | 'warning' | 'loading';
  duration?: number;
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toastList: ToastItem[] = [];
let nextId = 0;

function notify() {
  toastListeners.forEach(fn => fn([...toastList]));
}

export const toaster = {
  create(opts: { title?: string; description?: string; type?: string; duration?: number }) {
    const id = `toast-${nextId++}`;
    const item: ToastItem = {
      id,
      title: opts.title,
      description: opts.description,
      type: (opts.type as ToastItem['type']) || 'info',
      duration: opts.duration ?? 4000,
    };
    toastList = [...toastList, item];
    notify();
    if (item.duration && item.duration > 0) {
      setTimeout(() => {
        toastList = toastList.filter(t => t.id !== id);
        notify();
      }, item.duration);
    }
    return id;
  },
};

// --- Module-level style constants ---

const typeColors: Record<string, { bg: string; border: string }> = {
  info: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)' },
  success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)' },
  error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' },
  warning: { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)' },
  loading: { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
};

const S_CONTAINER: CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 99999,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxWidth: 360,
};

const TOAST_STYLE_BASE: Omit<CSSProperties, 'background' | 'border'> = {
  padding: '12px 16px',
  borderRadius: 10,
  backdropFilter: 'blur(12px)',
  color: '#fff',
  fontSize: 14,
  animation: 'fadeInUp 0.3s ease-out',
};

// Pre-allocate per-type toast styles to avoid per-render object creation
const S_TOAST_BY_TYPE: Record<string, CSSProperties> = Object.fromEntries(
  Object.entries(typeColors).map(([type, colors]) => [
    type,
    { ...TOAST_STYLE_BASE, background: colors.bg, border: `1px solid ${colors.border}` },
  ]),
);

const S_TOAST_TITLE: CSSProperties = { fontWeight: 600, marginBottom: 4 };
const S_TOAST_TITLE_SOLO: CSSProperties = { fontWeight: 600, marginBottom: 0 };
const S_TOAST_DESC: CSSProperties = { opacity: 0.8, fontSize: 13 };

function ToasterContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => { toastListeners = toastListeners.filter(fn => fn !== setToasts); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={S_CONTAINER}>
      {toasts.map(t => (
        <div key={t.id} style={S_TOAST_BY_TYPE[t.type || 'info'] || S_TOAST_BY_TYPE.info}>
          {t.title && <div style={t.description ? S_TOAST_TITLE : S_TOAST_TITLE_SOLO}>{t.title}</div>}
          {t.description && <div style={S_TOAST_DESC}>{t.description}</div>}
        </div>
      ))}
    </div>
  );
}

export function Toaster() {
  return <ToasterContainer />;
}
