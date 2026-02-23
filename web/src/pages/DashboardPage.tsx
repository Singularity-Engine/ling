import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HreflangTags } from '@/components/seo/HreflangTags';

interface DashboardData {
  experiment: {
    total_users: number;
    active_today: number;
    new_today: number;
    paid_users: number;
  };
  health: {
    uptime_hours: number;
    status: string;
  };
  updated_at: string;
}

const REFRESH_INTERVAL = 30_000; // 30 seconds

export function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch('/api/public/dashboard', { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DashboardData = await res.json();
        setData(json);
        setError(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(true);
      }
    };

    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, []);

  const statusOk = data?.health.status === 'running';

  return (
    <div style={S.page}>
      <Helmet>
        <title>{t('seo.dashboardTitle')}</title>
        <meta name="description" content={t('seo.dashboardDesc')} />
        <meta property="og:title" content={t('seo.dashboardTitle')} />
        <meta property="og:description" content={t('seo.dashboardDesc')} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <link rel="canonical" href="https://ling.sngxai.com/dashboard" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/dashboard" />

      <div style={S.inner}>
        {/* Header */}
        <div style={S.header}>
          <Link to="/" style={S.logo}>Ling</Link>
          <h1 style={S.title}>{t('dashboard.title')}</h1>
          <p style={S.subtitle}>{t('dashboard.subtitle')}</p>
        </div>

        {/* Cards grid */}
        <div style={S.grid}>
          {/* Total Users */}
          <div style={{ ...S.card, borderColor: 'rgba(139,92,246,0.4)' }}>
            <span style={S.cardLabel}>{t('dashboard.totalUsers')}</span>
            <span style={{ ...S.cardValue, color: 'var(--ling-purple-lighter, #c4b5fd)' }}>
              {data?.experiment.total_users ?? '—'}
            </span>
          </div>

          {/* Active Today */}
          <div style={{ ...S.card, borderColor: 'rgba(34,197,94,0.4)' }}>
            <span style={S.cardLabel}>{t('dashboard.activeToday')}</span>
            <span style={{ ...S.cardValue, color: '#4ade80' }}>
              {data?.experiment.active_today ?? '—'}
            </span>
          </div>

          {/* New Today */}
          <div style={{ ...S.card, borderColor: 'rgba(167,139,250,0.4)' }}>
            <span style={S.cardLabel}>{t('dashboard.newToday')}</span>
            <span style={{ ...S.cardValue, color: '#a78bfa' }}>
              {data?.experiment.new_today ?? '—'}
            </span>
          </div>

          {/* Status */}
          <div style={{ ...S.card, borderColor: statusOk ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)' }}>
            <span style={S.cardLabel}>{t('dashboard.systemStatus')}</span>
            <span style={{ ...S.cardValue, color: statusOk ? '#4ade80' : '#f87171' }}>
              {data ? (statusOk ? t('dashboard.statusRunning') : t('dashboard.statusDown')) : '—'}
            </span>
            {statusOk && (
              <span style={S.statusDot} />
            )}
          </div>
        </div>

        {/* Footer info */}
        <div style={S.footer}>
          {error && <p style={S.errorText}>Failed to load data</p>}
          {data && (
            <p style={S.updated}>
              {t('dashboard.lastUpdated')}: {new Date(data.updated_at).toLocaleTimeString()}
            </p>
          )}
          <p style={S.autoRefresh}>{t('dashboard.autoRefresh')}</p>
          <Link to="/" style={S.backLink}>{t('terms.backHome')}</Link>
        </div>
      </div>
    </div>
  );
}

// ── Static styles ──────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    minHeight: '100dvh',
    background: '#0a0015',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  inner: {
    width: '100%',
    maxWidth: 560,
    textAlign: 'center',
  },
  header: {
    marginBottom: 40,
  },
  logo: {
    fontSize: 36,
    fontWeight: 700,
    color: 'var(--ling-purple-lighter, #c4b5fd)',
    letterSpacing: 2,
    textDecoration: 'none',
    display: 'inline-block',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    margin: '8px 0 4px',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    transition: 'border-color 0.3s',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardValue: {
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 1,
  },
  statusDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 8px rgba(34,197,94,0.6)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  footer: {
    marginTop: 32,
  },
  updated: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    margin: '4px 0',
  },
  autoRefresh: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    margin: '4px 0 16px',
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    margin: '0 0 8px',
  },
  backLink: {
    fontSize: 13,
    color: 'var(--ling-purple-lighter, #c4b5fd)',
    textDecoration: 'none',
  },
};
