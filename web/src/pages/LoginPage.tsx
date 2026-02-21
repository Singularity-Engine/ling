import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/services/api-client';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
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
        <meta property="og:image" content="https://sngxai.com/og-image.png" />
        <link rel="canonical" href="https://sngxai.com/login" />
      </Helmet>
      <div style={styles.card}>
        <h1 style={styles.title}>Ling</h1>
        <p style={styles.subtitle}>{t('auth.loginTitle')}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder={t('auth.placeholderEmailOrUsername')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            style={styles.input}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder={t('auth.placeholderPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
            autoComplete="current-password"
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
          </button>
        </form>

        <p style={styles.footer}>
          {t('auth.loginFooter')}{' '}
          <Link to="/register" style={styles.link}>
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
    background: '#0a0015',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: 32,
    textAlign: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: 700,
    color: '#c4b5fd',
    margin: '0 0 4px',
    letterSpacing: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 32,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    transition: 'border 0.2s',
  },
  button: {
    marginTop: 8,
    padding: '12px 0',
    borderRadius: 8,
    border: 'none',
    background: 'rgba(139, 92, 246, 0.6)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    margin: 0,
  },
  footer: {
    marginTop: 24,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  link: {
    color: '#c4b5fd',
    textDecoration: 'none',
  },
};
