// apps/agent-tars/vite.config.web.ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

const EMPTY = path.resolve(__dirname, 'src/renderer/src/shims/empty.ts');

export default defineConfig({
  base: './',
  root: 'src/renderer',

  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },

  preview: {
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['localhost', 'ui-tars-desktop-my6k.onrender.com'],
  },

  build: {
    outDir: path.resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
      // Electron/Node専用は外す
      external: ['electron', 'fs', 'path'],
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
        format: 'iife',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    minify: true,
  },

  plugins: [react(), tsconfigPaths({ rootMode: 'upward' })],

  resolve: {
    alias: {
      // ---- 既存 alias ----
      '@': path.resolve(__dirname, 'src/renderer'),
      '@vendor/chat-ui': path.resolve(__dirname, 'src/vendor/chat-ui'),
      '@vendor/chat-ui/': path.resolve(__dirname, 'src/vendor/chat-ui') + '/',
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@shared/': path.resolve(__dirname, 'src/shared') + '/',
      '@main': path.resolve(__dirname, 'src/main'),
      '@main/': path.resolve(__dirname, 'src/main') + '/',
      '@resources': path.resolve(__dirname, 'src/resources'),
      '@resources/': path.resolve(__dirname, 'src/resources') + '/',
      '@renderer/api': path.resolve(__dirname, 'src/renderer/src/api'),
      '@renderer/api/': path.resolve(__dirname, 'src/renderer/src/api') + '/',

      // ---- Nodeコア/問題児をまとめて空に ----
      dotenv: EMPTY,
      crypto: EMPTY,
      fs: EMPTY,
      os: EMPTY,
      http: EMPTY,
      https: EMPTY,
      stream: EMPTY,
      url: EMPTY,
      zlib: EMPTY,
      'electron-store': EMPTY,
      'node-fetch': EMPTY,
      // もし他にも怒られたらここに追記
    },
  },

  define: {
    // renderer で process.env を参照しないよう安全網
    'process.env': {},
  },

  optimizeDeps: {
    // 先に読ませない
    exclude: ['electron-store', 'node-fetch', 'dotenv'],
  },
});
