import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('prefers-reduced-motion coverage', () => {
  const cssFiles = [
    'src/components/shared/BreathingBackground.module.css',
    'src/components/shared/Fracture.module.css',
    'src/components/shared/AnimatedNumber.module.css',
    'src/components/landing/BrandReveal.module.css',
    'src/components/landing/LingSilhouette.module.css',
    'src/pages/sngxai/Screen1.module.css',
  ];

  cssFiles.forEach((file) => {
    it(`${file} has prefers-reduced-motion media query`, () => {
      const css = fs.readFileSync(
        path.resolve(__dirname, '../../', file),
        'utf-8'
      );
      expect(css).toContain('prefers-reduced-motion');
    });
  });
});
