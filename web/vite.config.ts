import { defineConfig, normalizePath } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
    allowedHosts: ['sngxai.com', 'www.sngxai.com', 'localhost'],
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
          if (id.includes('node_modules/@chakra-ui') || id.includes('node_modules/@emotion') || id.includes('node_modules/@ark-ui') || id.includes('node_modules/@pandacss')) {
            return 'vendor-ui';
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
        },
      },
    },
  },
}));
