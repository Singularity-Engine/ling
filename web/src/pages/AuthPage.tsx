import { useState, type FormEvent, type CSSProperties } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthActions } from '@/context/AuthContext';
import { ApiError } from '@/services/api-client';
import { HreflangTags } from '@/components/seo/HreflangTags';
import { OAuthButtons } from './OAuthButtons';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const { t } = useTranslation();
  const { login, register } = useAuthActions();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ageConfirm, setAgeConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!ageConfirm) {
        setError(t('auth.ageConfirmRequired'));
        return;
      }
      if (password !== confirm) {
        setError(t('auth.passwordMismatch'));
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(identifier, password);
      } else {
        await register(email, username, password);
      }
      navigate('/');
    } catch (err) {
      const fallbackMsg = mode === 'login' ? t('auth.loginFailed') : t('auth.registerFailed');
      setError(err instanceof ApiError ? err.message : fallbackMsg);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div style={S.page}>
      <Helmet>
        <title>{isLogin ? t('auth.metaLoginTitle') : t('auth.metaRegisterTitle')}</title>
        <meta name="description" content={isLogin ? t('auth.metaLoginDesc') : t('auth.metaRegisterDesc')} />
        <meta property="og:title" content={isLogin ? t('auth.metaLoginTitle') : t('auth.metaRegisterTitle')} />
        <meta property="og:description" content={isLogin ? t('auth.metaLoginDesc') : t('auth.metaRegisterDesc')} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <link rel="canonical" href="https://ling.sngxai.com/auth" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/auth" />

      <div style={S.card}>
        {/* Header */}
        <h1 style={S.title}>Ling</h1>
        <p style={S.subtitle}>
          {isLogin ? t('auth.loginTitle') : t('auth.registerTitle')}
        </p>

        {/* OAuth first — prominent */}
        <OAuthButtons />

        {/* Divider */}
        <div style={S.dividerWrap}>
          <div style={S.dividerLine} />
          <span style={S.dividerText}>{t('auth.orDivider', { defaultValue: 'or' })}</span>
          <div style={S.dividerLine} />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} style={S.form}>
          {isLogin ? (
            <input
              type="text"
              className="ling-auth-input"
              placeholder={t('auth.placeholderEmailOrUsername')}
              aria-label={t('auth.placeholderEmailOrUsername')}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              style={S.input}
              autoComplete="username"
            />
          ) : (
            <>
              <input
                type="email"
                className="ling-auth-input"
                placeholder={t('auth.placeholderEmail')}
                aria-label={t('auth.placeholderEmail')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={S.input}
                autoComplete="email"
              />
              <input
                type="text"
                className="ling-auth-input"
                placeholder={t('auth.placeholderUsername')}
                aria-label={t('auth.placeholderUsername')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={S.input}
                autoComplete="username"
              />
            </>
          )}

          <input
            type="password"
            className="ling-auth-input"
            placeholder={t('auth.placeholderPassword')}
            aria-label={t('auth.placeholderPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            style={S.input}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />

          {!isLogin && (
            <input
              type="password"
              className="ling-auth-input"
              placeholder={t('auth.placeholderConfirmPassword')}
              aria-label={t('auth.placeholderConfirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={S.input}
              autoComplete="new-password"
            />
          )}

          {!isLogin && (
            <label style={S.checkboxLabel}>
              <input
                type="checkbox"
                checked={ageConfirm}
                onChange={(e) => setAgeConfirm(e.target.checked)}
                style={S.checkbox}
              />
              <span>
                {t('auth.ageConfirm')}{' '}
                <Link to="/terms" target="_blank" className="ling-auth-link" style={S.link}>
                  {t('auth.termsLink')}
                </Link>
              </span>
            </label>
          )}

          {error && <p style={S.error}>{error}</p>}

          <button type="submit" className="ling-auth-btn" disabled={loading} style={S.button}>
            {isLogin
              ? (loading ? t('auth.loginSubmitting') : t('auth.loginSubmit'))
              : (loading ? t('auth.registerSubmitting') : t('auth.registerSubmit'))}
          </button>
        </form>

        {/* Mode toggle */}
        <p style={S.footer}>
          {isLogin ? t('auth.loginFooter') : t('auth.registerFooter')}{' '}
          <button type="button" onClick={toggleMode} style={S.toggleBtn}>
            {isLogin ? t('auth.loginFooterLink') : t('auth.registerFooterLink')}
          </button>
        </p>

        {/* Back to Ling */}
        <Link to="/" style={S.backLink}>
          {t('auth.backToLing', { defaultValue: 'Talk to Ling' })}
        </Link>
      </div>
    </div>
  );
}

// ─── Hoisted style constants ───

const S: Record<string, CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100dvh',
    background: 'var(--ling-bg-deep)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--ling-space-4) 0',
  },
  card: {
    width: '90vw',
    maxWidth: 400,
    padding: '32px',
    textAlign: 'center',
    boxSizing: 'border-box',
    background: 'var(--ling-modal-bg, rgba(20, 8, 40, 0.95))',
    border: '1px solid var(--ling-modal-border, rgba(139, 92, 246, 0.08))',
    borderRadius: 16,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
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
    marginBottom: 'var(--ling-space-6)',
  },
  dividerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--ling-space-3)',
    margin: 'var(--ling-space-6) 0',
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
    color: 'var(--ling-text-primary)',
    fontSize: 'var(--ling-font-lg)',
    outline: 'none',
    transition: 'border var(--ling-duration-fast)',
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
    transition: 'opacity var(--ling-duration-fast)',
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
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ling-purple-lighter)',
    fontSize: 'inherit',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'none',
  },
  link: {
    color: 'var(--ling-purple-lighter)',
    textDecoration: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--ling-space-2)',
    color: 'var(--ling-text-dim)',
    fontSize: 'var(--ling-font-13)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  checkbox: {
    accentColor: 'var(--ling-purple)',
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  backLink: {
    display: 'inline-block',
    marginTop: 'var(--ling-space-4)',
    color: 'var(--ling-text-muted)',
    fontSize: 'var(--ling-font-13)',
    textDecoration: 'none',
    transition: 'color var(--ling-duration-fast)',
  },
};
