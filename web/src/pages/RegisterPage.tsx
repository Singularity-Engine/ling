import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthActions } from '@/context/AuthContext';
import { ApiError } from '@/services/api-client';
import { HreflangTags } from '@/components/seo/HreflangTags';

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuthActions();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ageConfirm, setAgeConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ageConfirm) {
      setError(t('auth.ageConfirmRequired'));
      return;
    }

    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await register(email, username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <Helmet>
        <title>{t('auth.metaRegisterTitle')}</title>
        <meta name="description" content={t('auth.metaRegisterDesc')} />
        <meta property="og:title" content={t('auth.metaRegisterTitle')} />
        <meta property="og:description" content={t('auth.metaRegisterDesc')} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <link rel="canonical" href="https://ling.sngxai.com/register" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/register" />
      <div style={styles.card}>
        <h1 style={styles.title}>Ling</h1>
        <p style={styles.subtitle}>{t('auth.registerTitle')}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            className="ling-auth-input"
            placeholder={t('auth.placeholderEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="text"
            className="ling-auth-input"
            placeholder={t('auth.placeholderUsername')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            minLength={8}
            style={styles.input}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="ling-auth-input"
            placeholder={t('auth.placeholderConfirmPassword')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={styles.input}
            autoComplete="new-password"
          />

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={ageConfirm}
              onChange={(e) => setAgeConfirm(e.target.checked)}
              style={styles.checkbox}
            />
            <span>
              {t('auth.ageConfirm')}{' '}
              <Link to="/terms" target="_blank" className="ling-auth-link" style={styles.link}>
                {t('auth.termsLink')}
              </Link>
            </span>
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" className="ling-auth-btn" disabled={loading} style={styles.button}>
            {loading ? t('auth.registerSubmitting') : t('auth.registerSubmit')}
          </button>
        </form>

        <p style={styles.footer}>
          {t('auth.registerFooter')}{' '}
          <Link to="/login" className="ling-auth-link" style={styles.link}>
            {t('auth.registerFooterLink')}
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
    padding: '32px 16px',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 40,
    fontWeight: 700,
    color: 'var(--ling-purple-lighter)',
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
    fontSize: 16,
    outline: 'none',
    transition: 'border 0.2s',
  },
  button: {
    marginTop: 8,
    padding: '12px 0',
    minHeight: 48,
    borderRadius: 8,
    border: 'none',
    background: 'var(--ling-purple-60)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  error: {
    color: 'var(--ling-error)',
    fontSize: 13,
    margin: 0,
  },
  footer: {
    marginTop: 24,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  link: {
    color: 'var(--ling-purple-lighter)',
    textDecoration: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: 'var(--ling-purple)',
    width: 16,
    height: 16,
    flexShrink: 0,
  },
};
