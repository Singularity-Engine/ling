/**
 * Post-build prerender: generates route-specific HTML files with correct meta tags.
 *
 * For each route (/terms, /login, /register), copies dist/index.html and replaces
 * <title>, <meta description>, og:title, og:description, and canonical URL.
 * This ensures crawlers see correct SEO metadata even without executing JavaScript.
 *
 * Run after `vite build`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SITE = 'https://ling.sngxai.com';

// Load translations to get localized SEO strings (use English as static fallback)
const en = JSON.parse(readFileSync(resolve(__dirname, '..', 'src', 'locales', 'en', 'translation.json'), 'utf-8'));

// Route-specific meta overrides
const ROUTES = [
  {
    path: '/terms',
    title: en.seo.termsTitle,
    desc: en.seo.termsDesc,
    ogTitle: en.seo.termsTitle,
  },
  {
    path: '/login',
    title: en.auth.metaLoginTitle,
    desc: en.auth.metaLoginDesc,
    ogTitle: en.auth.metaLoginTitle,
  },
  {
    path: '/register',
    title: en.auth.metaRegisterTitle,
    desc: en.auth.metaRegisterDesc,
    ogTitle: en.auth.metaRegisterTitle,
  },
  {
    path: '/dashboard',
    title: en.seo.dashboardTitle,
    desc: en.seo.dashboardDesc,
    ogTitle: en.seo.dashboardTitle,
  },
];

const indexHtml = readFileSync(resolve(DIST, 'index.html'), 'utf-8');

for (const route of ROUTES) {
  let html = indexHtml;

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`);

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${route.desc}"`
  );

  // Replace og:title
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${route.ogTitle}"`
  );

  // Replace og:description
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${route.desc}"`
  );

  // Replace canonical URL
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${SITE}${route.path}"`
  );

  // Replace og:url
  html = html.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${SITE}${route.path}"`
  );

  // Replace static hreflang links to point to this route
  html = html.replace(
    /(<link rel="alternate" hreflang="[^"]*" href=")https:\/\/ling\.sngxai\.com\/(")/g,
    `$1${SITE}${route.path}$2`
  );

  // Write to dist/<route>/index.html
  const dir = resolve(DIST, route.path.slice(1));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), html, 'utf-8');
}

console.log(`✓ Prerendered ${ROUTES.length} route HTML files (${ROUTES.map(r => r.path).join(', ')})`);
