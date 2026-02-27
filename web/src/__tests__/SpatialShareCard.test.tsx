import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { SpatialShareCard } from '../components/dialogue/SpatialShareCard';

const cssPath = path.resolve(__dirname, '../components/dialogue/SpatialShareCard.module.css');
const css = fs.readFileSync(cssPath, 'utf-8');

describe('SpatialShareCard', () => {
  const defaultProps = {
    content: 'The boundary between AI and human is fracturing.',
    timestamp: '2 hours ago',
    onClose: vi.fn(),
    onShare: vi.fn(),
  };

  it('renders preview area with content', () => {
    const { getByText } = render(<SpatialShareCard {...defaultProps} />);
    expect(getByText(defaultProps.content)).toBeTruthy();
  });

  it('renders close button', () => {
    const { getByText } = render(<SpatialShareCard {...defaultProps} />);
    const btn = getByText('Close');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders share button', () => {
    const { getByText } = render(<SpatialShareCard {...defaultProps} />);
    const btn = getByText('Share');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(defaultProps.onShare).toHaveBeenCalled();
  });

  it('(static) CSS contains backdrop-filter', () => {
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('content has data-voice="ling" preview style', () => {
    const { container } = render(<SpatialShareCard {...defaultProps} />);
    const voiceEl = container.querySelector('[data-voice="ling"]');
    expect(voiceEl).toBeTruthy();
    expect(voiceEl!.textContent).toContain(defaultProps.content);
  });
});
