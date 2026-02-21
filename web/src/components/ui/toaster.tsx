'use client';

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

const typeColors: Record<string, { bg: string; border: string }> = {
  info: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)' },
  success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)' },
  error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' },
  warning: { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)' },
  loading: { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
};

function ToasterContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => { toastListeners = toastListeners.filter(fn => fn !== setToasts); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }}>
      {toasts.map(t => {
        const colors = typeColors[t.type || 'info'] || typeColors.info;
        return (
          <div key={t.id} style={{
            padding: '12px 16px', borderRadius: 10,
            background: colors.bg, border: `1px solid ${colors.border}`,
            backdropFilter: 'blur(12px)', color: '#fff',
            fontSize: 14, animation: 'fadeInUp 0.3s ease-out',
          }}>
            {t.title && <div style={{ fontWeight: 600, marginBottom: t.description ? 4 : 0 }}>{t.title}</div>}
            {t.description && <div style={{ opacity: 0.8, fontSize: 13 }}>{t.description}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Toaster() {
  return <ToasterContainer />;
}
