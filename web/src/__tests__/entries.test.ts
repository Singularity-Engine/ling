import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Entry point restructure (彻底版)', () => {
  const webRoot = path.resolve(__dirname, '../..');

  it('main.tsx does NOT exist', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../main.tsx'))).toBe(false);
  });

  it('colors.ts does NOT exist', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../constants/colors.ts'))).toBe(false);
  });

  it('entries/ling.tsx exists and imports tokens.css FIRST', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entries/ling.tsx'), 'utf-8');
    expect(src).toContain('tokens.css');
    expect(src).toContain('createRoot');
    const tokensIdx = src.indexOf('tokens.css');
    const indexIdx = src.indexOf('index.css');
    expect(tokensIdx).toBeLessThan(indexIdx); // tokens loaded before index.css
  });

  it('entries/sngxai.tsx exists and imports tokens.css', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entries/sngxai.tsx'), 'utf-8');
    expect(src).toContain('tokens.css');
    expect(src).toContain('createRoot');
  });

  it('index.html points to entries/ling.tsx, not main.tsx', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf-8');
    expect(html).toContain('entries/ling.tsx');
    expect(html).not.toContain('src/main.tsx');
  });

  it('index.html has Instrument Serif Google Font', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf-8');
    expect(html).toContain('Instrument+Serif');
    expect(html).toContain('fonts.googleapis.com');
  });

  it('sngxai.html exists with Instrument Serif', () => {
    const html = fs.readFileSync(path.join(webRoot, 'sngxai.html'), 'utf-8');
    expect(html).toContain('entries/sngxai.tsx');
    expect(html).toContain('Instrument+Serif');
  });

  it('vite.config.ts has multi-entry rollupOptions.input', () => {
    const config = fs.readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf-8');
    expect(config).toContain("sngxai");
    expect(config).toContain("input");
  });

  it('App.tsx does not import colors.ts', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(app).not.toContain('constants/colors');
    expect(app).not.toContain('MISC_COLORS');
  });

  it('ConnectionStatus.tsx does not import colors.ts', () => {
    const cs = fs.readFileSync(
      path.resolve(__dirname, '../components/status/ConnectionStatus.tsx'),
      'utf-8'
    );
    expect(cs).not.toContain('constants/colors');
    expect(cs).not.toContain('OVERLAY_COLORS');
  });
});
