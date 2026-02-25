import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>
);

export function OAuthButtons() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<'google' | 'github' | null>(null);

  const startOAuth = async (provider: 'google' | 'github') => {
    setLoading(provider);
    try {
      const resp = await fetch(`/api/auth/oauth/${provider}`);
      if (resp.status === 501) {
        toaster.create({ title: t('auth.oauthNotConfigured'), type: 'error' });
        setLoading(null);
        return;
      }
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toaster.create({ title: t('auth.oauthStartFailed'), type: 'error' });
        setLoading(null);
      }
    } catch {
      toaster.create({ title: t('auth.oauthStartFailed'), type: 'error' });
      setLoading(null);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.dividerWrap}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>{t('auth.orContinueWith')}</span>
        <div style={styles.dividerLine} />
      </div>
      <div style={styles.oauthRow}>
        <button
          type="button"
          style={styles.oauthBtn}
          onClick={() => startOAuth('google')}
          disabled={loading !== null}
        >
          <GoogleIcon />
          {loading === 'google' ? '...' : 'Google'}
        </button>
        <button
          type="button"
          style={styles.oauthBtn}
          onClick={() => startOAuth('github')}
          disabled={loading !== null}
        >
          <GitHubIcon />
          {loading === 'github' ? '...' : 'GitHub'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    marginTop: 'var(--ling-space-6)',
  },
  dividerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--ling-space-3)',
    marginBottom: 'var(--ling-space-4)',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--ling-overlay-12)',
  },
  dividerText: {
    color: 'var(--ling-text-muted)',
    fontSize: 'var(--ling-font-13)',
    whiteSpace: 'nowrap',
  },
  oauthRow: {
    display: 'flex',
    gap: 'var(--ling-space-3)',
  },
  oauthBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--ling-space-2)',
    padding: 'var(--ling-space-3) 0',
    minHeight: 44,
    borderRadius: 'var(--ling-radius-8)',
    border: '1px solid var(--ling-overlay-12)',
    background: 'var(--ling-surface)',
    color: '#fff',
    fontSize: 'var(--ling-font-md)',
    cursor: 'pointer',
    transition: 'border-color var(--ling-duration-fast)',
  },
};
