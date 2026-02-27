import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('spatial CSS foundation', () => {
  const tokens = fs.readFileSync(
    path.resolve(__dirname, '../styles/tokens.css'),
    'utf-8'
  );
  const spatial = fs.readFileSync(
    path.resolve(__dirname, '../styles/spatial.css'),
    'utf-8'
  );

  it('tokens.css has spatial fade tokens', () => {
    expect(tokens).toContain('--ling-spatial-fade-1');
  });

  it('tokens.css has spatial scale tokens', () => {
    expect(tokens).toContain('--ling-spatial-scale-1');
  });

  it('tokens.css has sparkle token', () => {
    expect(tokens).toContain('--ling-sparkle');
  });

  it('spatial.css has prefers-reduced-motion', () => {
    expect(spatial).toContain('prefers-reduced-motion');
  });

  it('spatial.css has core animations', () => {
    expect(spatial).toContain('messageInhale');
    expect(spatial).toContain('memorySparkle');
    expect(spatial).toContain('suggestionFloat');
  });
});
