import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Fracture } from '../components/shared/Fracture';

describe('Fracture', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Fracture />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('has a path element', () => {
    const { container } = render(<Fracture />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
  });

  it('is decorative (aria-hidden)', () => {
    const { container } = render(<Fracture />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('accepts variant prop', () => {
    const { container: subtle } = render(<Fracture variant="subtle" />);
    const { container: prominent } = render(<Fracture variant="prominent" />);
    expect(subtle.querySelector('svg')).toBeTruthy();
    expect(prominent.querySelector('svg')).toBeTruthy();
  });
});
