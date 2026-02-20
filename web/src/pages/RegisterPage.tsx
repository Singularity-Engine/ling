import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/services/api-client';

export function RegisterPage() {
  const { register } = useAuth();
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
      setError('Please confirm you are 16 or older');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register(email, username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <Helmet>
        <title>注册 — 灵 - AI 数字人</title>
        <meta name="description" content="注册灵账号，拥有你的 AI 数字人伴侣。" />
        <meta property="og:title" content="注册 — 灵 - AI 数字人" />
        <meta property="og:description" content="注册灵账号，拥有你的 AI 数字人伴侣。" />
        <meta property="og:image" content="https://sngxai.com/og-image.png" />
        <link rel="canonical" href="https://sngxai.com/register" />
      </Helmet>
      <div style={styles.card}>
        <h1 style={styles.title}>Ling</h1>
        <p style={styles.subtitle}>Create your account</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="text"
            placeholder="Username (3-30 chars, letters/numbers/underscore)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={styles.input}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={styles.input}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm password"
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
              I am 16 or older and agree to the{' '}
              <Link to="/terms" target="_blank" style={styles.link}>
                Terms of Service
              </Link>
            </span>
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>
            Sign in
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#8b5cf6',
    width: 16,
    height: 16,
    flexShrink: 0,
  },
};
