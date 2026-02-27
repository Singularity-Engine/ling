import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { SpatialMessage } from '../components/dialogue/SpatialMessage';

describe('SpatialMessage', () => {
  it('assistant message has data-voice="ling"', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="Hello" fadeTier={1} gapTier="near" />
    );
    expect(container.querySelector('[data-voice="ling"]')).toBeTruthy();
  });

  it('user message has data-voice="world"', () => {
    const { container } = render(
      <SpatialMessage role="human" content="Hi" fadeTier={1} gapTier="near" />
    );
    expect(container.querySelector('[data-voice="world"]')).toBeTruthy();
  });

  it('fadeTier maps to data-fade', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="x" fadeTier={3} gapTier="mid" />
    );
    expect(container.querySelector('[data-fade="3"]')).toBeTruthy();
  });

  it('gapTier maps to data-gap', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="x" fadeTier={1} gapTier="far" />
    );
    expect(container.querySelector('[data-gap="far"]')).toBeTruthy();
  });

  it('animate=true sets data-animate', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="x" fadeTier={1} gapTier="near" animate />
    );
    expect(container.querySelector('[data-animate="true"]')).toBeTruthy();
  });

  it('isStreaming renders cursor', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="x" fadeTier={1} gapTier="near" isStreaming />
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('assistant message renders content', () => {
    render(
      <SpatialMessage role="ai" content="Hello world" fadeTier={1} gapTier="near" />
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('hasMemoryRef renders sparkle elements', () => {
    const { container } = render(
      <SpatialMessage role="ai" content="x" fadeTier={1} gapTier="near" hasMemoryRef />
    );
    const sparkles = container.querySelectorAll('[class*="sparkle"]');
    expect(sparkles.length).toBeGreaterThan(0);
  });

  it('hasSuggestion renders suggestion link', () => {
    render(
      <SpatialMessage
        role="ai"
        content="x"
        fadeTier={1}
        gapTier="near"
        hasSuggestion
        onSuggestionClick={vi.fn()}
      />
    );
    expect(screen.getByText(/suggestion/i)).toBeTruthy();
  });

  it('timestamp is rendered', () => {
    render(
      <SpatialMessage role="ai" content="x" fadeTier={1} gapTier="near" timestamp="2h ago" />
    );
    expect(screen.getByText('2h ago')).toBeTruthy();
  });

  it('user message has right accent line (P1-4)', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SpatialMessage.module.css'),
      'utf-8'
    );
    expect(css).toContain('border-right');
  });

  it('CSS has prefers-reduced-motion', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SpatialMessage.module.css'),
      'utf-8'
    );
    expect(css).toContain('prefers-reduced-motion');
  });

  it('CSS fade variables have fallback values', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SpatialMessage.module.css'),
      'utf-8'
    );
    // Each fade tier must have a fallback in case tokens.css fails to load
    expect(css).toContain('--ling-spatial-fade-1, 1');
    expect(css).toContain('--ling-spatial-fade-2, 0.7');
    expect(css).toContain('--ling-spatial-fade-3, 0.45');
    expect(css).toContain('--ling-spatial-fade-4, 0.2');
    expect(css).toContain('--ling-spatial-scale-1, 1');
    expect(css).toContain('--ling-spatial-scale-2, 0.98');
  });
});
