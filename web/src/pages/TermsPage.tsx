import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HreflangTags } from '@/components/seo/HreflangTags';

export function TermsPage() {
  const { t } = useTranslation();
  const items = t('terms.s2Items', { returnObjects: true }) as string[];
  const seoTitle = t('seo.termsTitle');
  const seoDesc = t('seo.termsDesc');

  return (
    <div style={styles.page}>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:image" content="https://ling.sngxai.com/og-image.png" />
        <link rel="canonical" href="https://ling.sngxai.com/terms" />
      </Helmet>
      <HreflangTags canonicalUrl="https://ling.sngxai.com/terms" />
      <div style={styles.container}>
        <h1 style={styles.title}>{t('terms.title')}</h1>
        <p style={styles.updated}>{t('terms.updated')}</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s1Title')}</h2>
          <p style={styles.p}>{t('terms.s1Body')}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s2Title')}</h2>
          <ul style={styles.ul}>
            {Array.isArray(items) && items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s3Title')}</h2>
          <p style={styles.p}>{t('terms.s3Body')}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s4Title')}</h2>
          <p style={styles.p}>{t('terms.s4Body')}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s5Title')}</h2>
          <p style={styles.p}>{t('terms.s5Body')}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>{t('terms.s6Title')}</h2>
          <p style={styles.p}>{t('terms.s6Body')}</p>
        </section>

        <div style={styles.back}>
          <Link to="/" style={styles.link}>{t('terms.backHome')}</Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100dvh',
    background: 'var(--ling-bg-deep)',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: 640,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ling-purple-lighter)',
    marginBottom: 4,
  },
  updated: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginBottom: 32,
  },
  section: { marginBottom: 28 },
  h2: {
    fontSize: 18,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  p: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: '1.7',
    margin: 0,
  },
  ul: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: '1.7',
    paddingLeft: 20,
    margin: 0,
  },
  back: { marginTop: 40, textAlign: 'center' },
  link: { color: 'var(--ling-purple-lighter)', textDecoration: 'none', fontSize: 14 },
};
