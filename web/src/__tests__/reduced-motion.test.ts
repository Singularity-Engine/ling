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
    'src/pages/sngxai/SngxaiApp.module.css',
    'src/pages/sngxai/ActionCard.module.css',
    'src/pages/sngxai/Screen2.module.css',
    'src/pages/sngxai/Screen3.module.css',
    'src/pages/sngxai/Sparkline.module.css',
    'src/pages/sngxai/CircleTier.module.css',
    'src/pages/sngxai/Screen4.module.css',
    'src/pages/sngxai/Screen5.module.css',
    'src/pages/sngxai/FilmGrain.module.css',
    'src/styles/spatial.css',
    'src/components/dialogue/SpatialMessage.module.css',
    'src/components/dialogue/ThinkingGlow.module.css',
    'src/components/dialogue/SpatialInput.module.css',
    'src/components/dialogue/SuggestionBubble.module.css',
    'src/components/dialogue/BrandEntrance.module.css',
    'src/components/dialogue/SpatialShareCard.module.css',
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
