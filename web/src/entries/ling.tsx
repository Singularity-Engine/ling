// SOLE entry point for ling.sngxai.com — replaces main.tsx
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import '../styles/tokens.css';
import '../styles/spatial.css';
import '../index.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import App from '../App';
import '../i18n';
import { initSentry } from '../lib/sentry';
import { initAnalytics } from '../lib/analytics';
import { createLogger } from '../utils/logger';

const log = createLogger('Main');

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('onnxruntime')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};


if (typeof window !== 'undefined') {
  // Initialize monitoring & analytics (non-blocking, env-var gated)
  initSentry();
  initAnalytics();

  // Defer Live2D WebSDK import — keeps vendor-live2d chunk off the critical path.
  // Landing animation runs ~7s, plenty of time for the async import to resolve.
  import('../../WebSDK/src/lappadapter').then(({ LAppAdapter }) => {
    window.getLAppAdapter = () => LAppAdapter.getInstance() as unknown as LAppAdapterLike;
  }).catch((err) => log.error('Failed to load LAppAdapter:', err));

  // Render React immediately — don't block on Live2D Core.
  // Landing animation runs ~7s, plenty of time for the script to load in background.
  createRoot(document.getElementById('root')!).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );

  // Load Live2D Core in background (preloaded via <link rel="preload"> in index.html)
  const script = document.createElement('script');
  script.src = './libs/live2dcubismcore.js';
  script.onerror = (error) => log.error('Failed to load Live2D Cubism Core:', error);
  document.head.appendChild(script);
}
