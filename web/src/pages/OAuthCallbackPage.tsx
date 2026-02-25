import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api-client';

export function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');
    const errorParam = params.get('error');

    if (errorParam) {
      const errorMap: Record<string, string> = {
        oauth_failed: t('auth.oauthFailed'),
        no_email: t('auth.oauthNoEmail'),
      };
      setError(errorMap[errorParam] || t('auth.oauthUnknownError'));
      return;
    }

    if (!token || !refreshToken) {
      setError(t('auth.oauthNoToken'));
      return;
    }

    apiClient.setTokens(token, refreshToken);
    // Clear tokens from URL to prevent leakage via browser history / Referer header
    window.history.replaceState({}, '', '/oauth/callback');
    // Full-page reload to re-initialize AuthProvider with new tokens
    window.location.href = '/';
  }, [t]);

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.error}>{error}</p>
          <Link to="/login" style={styles.link}>{t('auth.backToLogin')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.text}>{t('auth.oauthCompleting')}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100dvh',
    background: 'var(--ling-bg-deep)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    textAlign: 'center',
    padding: 'var(--ling-space-8)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--ling-overlay-12)',
    borderTopColor: 'var(--ling-purple)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto var(--ling-space-4)',
  },
  text: {
    color: 'var(--ling-text-dim)',
    fontSize: 'var(--ling-font-md)',
  },
  error: {
    color: 'var(--ling-error)',
    fontSize: 'var(--ling-font-md)',
    marginBottom: 'var(--ling-space-4)',
  },
  link: {
    color: 'var(--ling-purple-lighter)',
    textDecoration: 'none',
    fontSize: 'var(--ling-font-md)',
  },
};
