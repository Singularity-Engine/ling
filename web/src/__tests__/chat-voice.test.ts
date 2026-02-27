import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Chat voice attributes', () => {
  it('SpatialMessage.tsx uses data-voice attribute', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SpatialMessage.tsx'),
      'utf-8'
    );
    expect(src).toContain('data-voice');
  });

  it('spatial.css references --ling-font-ling for AI text', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../styles/spatial.css'),
      'utf-8'
    );
    expect(src).toContain('--ling-font-ling');
  });
});
