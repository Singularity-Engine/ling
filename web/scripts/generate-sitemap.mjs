/**
 * Generate sitemap.xml with hreflang annotations for all supported languages.
 * Run before `vite build` to emit public/sitemap.xml into the build output.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE = 'https://ling.sngxai.com';
const LANGUAGES = ['en', 'zh', 'ja', 'ko', 'es', 'pt-BR', 'de', 'fr'];
const PAGES = ['/', '/terms'];

function hreflangLinks(page) {
  return LANGUAGES.map(
    (lng) => `      <xhtml:link rel="alternate" hreflang="${lng}" href="${SITE}${page}" />`
  ).join('\n') + `\n      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${page}" />`;
}

function urlEntry(page) {
  return `  <url>
    <loc>${SITE}${page}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page === '/' ? '1.0' : '0.5'}</priority>
${hreflangLinks(page)}
  </url>`;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(urlEntry).join('\n')}
</urlset>
`;

const outPath = resolve(__dirname, '..', 'public', 'sitemap.xml');
writeFileSync(outPath, sitemap, 'utf-8');
console.log(`✓ sitemap.xml generated (${PAGES.length} pages × ${LANGUAGES.length} languages)`);
