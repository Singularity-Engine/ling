import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import App from './App';
import { LAppAdapter } from '../WebSDK/src/lappadapter';
import './i18n';
import { initSentry } from './lib/sentry';
import { initAnalytics } from './lib/analytics';
import { createLogger } from './utils/logger';

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

  window.getLAppAdapter = () => LAppAdapter.getInstance() as unknown as LAppAdapterLike;

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
