import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import React from 'react';

// Mock useVisualViewport
vi.mock('../hooks/useVisualViewport', () => ({
  useVisualViewport: vi.fn(() => ({ keyboardOffset: 0 })),
}));

// Mock InputBar
vi.mock('../components/chat/InputBar', () => ({
  InputBar: () => <div data-testid="input-bar" />,
}));

import { useVisualViewport } from '../hooks/useVisualViewport';
import { SpatialInput } from '../components/dialogue/SpatialInput';

const cssPath = path.resolve(__dirname, '../components/dialogue/SpatialInput.module.css');
const css = fs.readFileSync(cssPath, 'utf-8');

describe('SpatialInput', () => {
  it('renders InputBar child component', () => {
    const { getByTestId } = render(<SpatialInput />);
    expect(getByTestId('input-bar')).toBeTruthy();
  });

  it('contains awakeBorder element', () => {
    const { container } = render(<SpatialInput />);
    const border = container.querySelector('[aria-hidden="true"]');
    expect(border).toBeTruthy();
  });

  it('(static) CSS contains backdrop-filter + -webkit-backdrop-filter', () => {
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('(static) CSS contains prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('(static) CSS contains env(safe-area-inset-bottom)', () => {
    expect(css).toContain('env(safe-area-inset-bottom');
  });

  it('P1-E: wrapper has transform style when keyboardOffset > 0', () => {
    vi.mocked(useVisualViewport).mockReturnValue({ keyboardOffset: 300 });

    const { container } = render(<SpatialInput />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toContain('translateY(-300px)');
  });
});
