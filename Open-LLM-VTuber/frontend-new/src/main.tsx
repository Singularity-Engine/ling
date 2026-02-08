import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LAppAdapter } from '../WebSDK/src/lappadapter';
import './i18n';

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('onnxruntime')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// Suppress specific console.error messages from @chatscope/chat-ui-kit-react
const originalConsoleError = console.error;
const errorMessagesToIgnore = ["Warning: Failed"];
console.error = (...args: any[]) => {
  if (typeof args[0] === 'string') {
    const shouldIgnore = errorMessagesToIgnore.some(msg => args[0].startsWith(msg));
    if (shouldIgnore) {
      return;
    }
  }
  originalConsoleError.apply(console, args);
};

if (typeof window !== 'undefined') {
  (window as any).getLAppAdapter = () => LAppAdapter.getInstance();

  const renderApp = () => {
    createRoot(document.getElementById('root')!).render(
      <App />,
    );
  };

  // Load Live2D Core with timeout protection
  const loadLive2DCore = () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('Live2D Core load timeout (3s), rendering without it.');
        resolve(); // 超时也渲染App
      }, 3000);

      const script = document.createElement('script');
      script.src = './libs/live2dcubismcore.js';
      script.onload = () => {
        clearTimeout(timeout);
        console.log('Live2D Cubism Core loaded successfully.');
        resolve();
      };
      script.onerror = (error) => {
        clearTimeout(timeout);
        console.error('Failed to load Live2D Cubism Core:', error);
        resolve(); // 失败也渲染App
      };
      document.head.appendChild(script);
    });
  };

  loadLive2DCore()
    .then(() => renderApp())
    .catch(() => renderApp());
}
