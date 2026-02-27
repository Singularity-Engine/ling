import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Chat voice attributes', () => {
  it('ChatBubble.tsx uses data-voice attribute', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/ChatBubble.tsx'),
      'utf-8'
    );
    expect(src).toContain('data-voice');
  });

  it('ChatBubble.styles.ts references --ling-font-ling for AI text', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/ChatBubble.styles.ts'),
      'utf-8'
    );
    expect(src).toContain('--ling-font-ling');
  });
});
