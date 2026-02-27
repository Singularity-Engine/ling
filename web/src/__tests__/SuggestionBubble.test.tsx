import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { SuggestionBubble } from '../components/dialogue/SuggestionBubble';

describe('SuggestionBubble', () => {
  it('renders trigger when visible', () => {
    render(<SuggestionBubble visible onSubmit={vi.fn()} />);
    expect(screen.getByText(/I have a suggestion/)).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const { container } = render(<SuggestionBubble visible={false} onSubmit={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('expands input on trigger click', () => {
    render(<SuggestionBubble visible onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText(/I have a suggestion/));
    expect(screen.getByPlaceholderText('Your suggestion...')).toBeTruthy();
  });

  it('input has placeholder', () => {
    render(<SuggestionBubble visible onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText(/I have a suggestion/));
    expect(screen.getByPlaceholderText('Your suggestion...')).toBeTruthy();
  });

  it('shows confirmation after send', () => {
    render(<SuggestionBubble visible onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText(/I have a suggestion/));
    const input = screen.getByPlaceholderText('Your suggestion...');
    fireEvent.change(input, { target: { value: 'test idea' } });
    fireEvent.click(screen.getByText('Send'));
    expect(screen.getByText(/Suggestion noted/)).toBeTruthy();
  });

  it('calls onSubmit with text', () => {
    const onSubmit = vi.fn();
    render(<SuggestionBubble visible onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/I have a suggestion/));
    const input = screen.getByPlaceholderText('Your suggestion...');
    fireEvent.change(input, { target: { value: 'my suggestion' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('my suggestion');
  });

  it('CSS has backdrop-filter and -webkit-backdrop-filter', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SuggestionBubble.module.css'),
      'utf-8'
    );
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('-webkit-backdrop-filter');
  });

  it('CSS trigger has min-height 44px (P0-F)', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../components/dialogue/SuggestionBubble.module.css'),
      'utf-8'
    );
    expect(css).toContain('min-height: 44px');
  });
});
