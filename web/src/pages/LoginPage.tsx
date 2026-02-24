import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthActions } from '@/context/AuthContext';
import { ApiError } from '@/services/api-client';
import { HreflangTags } from '@/components/seo/HreflangTags';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <Helmet>
        <title>{t('auth.metaLoginTitle')}</title>
        <meta name="description" content={t('auth.metaLoginDesc')} />
        <meta property="og:title" content={t('auth.metaLoginTitle')} />
        <meta property="og:description" content={t('auth.metaLoginDesc')} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <link rel="canonical" href="https://ling.sngxai.com/login" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/login" />
      <div style={styles.card}>
        <h1 style={styles.title}>Ling</h1>
        <p style={styles.subtitle}>{t('auth.loginTitle')}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            className="ling-auth-input"
            placeholder={t('auth.placeholderEmailOrUsername')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            style={styles.input}
            autoComplete="username"
          />
          <input
            type="password"
            className="ling-auth-input"
            placeholder={t('auth.placeholderPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
            autoComplete="current-password"
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" className="ling-auth-btn" disabled={loading} style={styles.button}>
            {loading ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
          </button>
        </form>

        <p style={styles.footer}>
          {t('auth.loginFooter')}{' '}
          <Link to="/register" className="ling-auth-link" style={styles.link}>
            {t('auth.loginFooterLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    height: '100dvh',
    background: 'var(--ling-bg-deep)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: 'var(--ling-space-8) var(--ling-space-4)',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 40,
    fontWeight: 700,
    color: 'var(--ling-purple-lighter)',
    margin: '0 0 var(--ling-space-1)',
    letterSpacing: 2,
  },
  subtitle: {
    color: 'var(--ling-text-dim)',
    fontSize: 'var(--ling-font-md)',
    marginBottom: 'var(--ling-space-8)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ling-space-4)',
  },
  input: {
    padding: 'var(--ling-space-3) var(--ling-space-4)',
    borderRadius: 'var(--ling-radius-8)',
    border: '1px solid var(--ling-overlay-12)',
    background: 'var(--ling-surface)',
    color: '#fff',
    fontSize: 'var(--ling-font-lg)',
    outline: 'none',
    transition: `border var(--ling-duration-fast)`,
  },
  button: {
    marginTop: 'var(--ling-space-2)',
    padding: 'var(--ling-space-3) 0',
    minHeight: 48,
    borderRadius: 'var(--ling-radius-8)',
    border: 'none',
    background: 'var(--ling-purple-60)',
    color: '#fff',
    fontSize: 'var(--ling-font-15)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: `opacity var(--ling-duration-fast)`,
  },
  error: {
    color: 'var(--ling-error)',
    fontSize: 'var(--ling-font-13)',
    margin: 0,
  },
  footer: {
    marginTop: 'var(--ling-space-6)',
    color: 'var(--ling-text-dim)',
    fontSize: 'var(--ling-font-13)',
  },
  link: {
    color: 'var(--ling-purple-lighter)',
    textDecoration: 'none',
  },
};
