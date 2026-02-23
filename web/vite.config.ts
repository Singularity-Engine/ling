import { defineConfig, normalizePath } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(path.resolve(__dirname, 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js')),
          dest: './libs/',
        },
        {
          src: normalizePath(path.resolve(__dirname, 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx')),
          dest: './libs/',
        },
        {
          src: normalizePath(path.resolve(__dirname, 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx')),
          dest: './libs/',
        },
        {
          src: normalizePath(path.resolve(__dirname, 'node_modules/onnxruntime-web/dist/*.wasm')),
          dest: './libs/',
        },
        {
          src: normalizePath(path.resolve(__dirname, 'WebSDK/Core/live2dcubismcore.js')),
          dest: './libs/',
        },
      ],
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use existing manifest.json in public/ — only override what's needed
      manifest: {
        name: 'Ling — AI Companion',
        short_name: 'Ling',
        description: "The world's first AI entrepreneur. Talk to Ling, become her advisor, help her survive.",
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0015',
        theme_color: '#0a0015',
        orientation: 'any',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache built assets (JS/CSS/HTML)
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        // Don't precache large binary files — they'll be cached at runtime
        globIgnores: ['**/libs/*.onnx', '**/libs/*.wasm', '**/live2d-models/**', '**/pwa-icon-*.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
        runtimeCaching: [
          {
            // Locale JSON chunks — cache first, update in background
            urlPattern: /\/assets\/locale-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'locale-chunks', expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            // Live2D model data — cache first (large, rarely changes)
            urlPattern: /\/libs\/live2dcubismcore\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'live2d-core', expiration: { maxEntries: 1, maxAgeSeconds: 90 * 24 * 3600 } },
          },
          {
            // ONNX/WASM files — cache first (large, versioned)
            urlPattern: /\/libs\/.*\.(onnx|wasm)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'ml-models', expiration: { maxEntries: 10, maxAgeSeconds: 90 * 24 * 3600 } },
          },
          {
            // API calls — network first (always need fresh data)
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 }, networkTimeoutSeconds: 10 },
          },
          {
            // TTS audio — network only (streaming, no cache)
            urlPattern: /tts\.sngxai\.com/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@framework": path.resolve(__dirname, "./WebSDK/Framework/src"),
      "@cubismsdksamples": path.resolve(__dirname, "./WebSDK/src"),
    },
  },
  root: __dirname,
  publicDir: path.join(__dirname, "public"),
  base: "./",
  server: {
    port: 3001,
    host: '0.0.0.0',
    allowedHosts: ['sngxai.com', 'www.sngxai.com', 'ling.sngxai.com', 'localhost'],
    proxy: {
      '/ws': {
        target: 'ws://localhost:12393',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:12393',
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    drop: mode === 'production' ? ['debugger'] : [],
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: "assets",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/onnxruntime-web')) {
            return 'vendor-onnx';
          }
          if (id.includes('WebSDK/') || id.includes('live2d')) {
            return 'vendor-live2d';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          if (id.includes('node_modules/@ricky0123/vad-web')) {
            return 'vendor-vad';
          }
          if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('micromark') || id.includes('mdast') || id.includes('hast') || id.includes('unified') || id.includes('highlight.js') || id.includes('lowlight') || id.includes('fault')) {
            return 'vendor-markdown';
          }
          if (id.includes('node_modules/react-icons')) {
            return 'vendor-icons';
          }
          // Lazy-loaded locale chunks
          if (id.includes('/locales/ja/')) return 'locale-ja';
          if (id.includes('/locales/ko/')) return 'locale-ko';
          if (id.includes('/locales/es/')) return 'locale-es';
          if (id.includes('/locales/pt-BR/')) return 'locale-pt-BR';
          if (id.includes('/locales/de/')) return 'locale-de';
          if (id.includes('/locales/fr/')) return 'locale-fr';
        },
      },
    },
  },
}));
