// apps/agent-tars/vite.config.web.ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

const EMPTY_DIR = path.resolve(__dirname, 'src/renderer/src/shims/empty');
const EMPTY = path.resolve(EMPTY_DIR, 'index.ts');

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

      // Nodeコア & 問題児
      dotenv: EMPTY,
      crypto: EMPTY,
      fs: EMPTY,
      'fs/promises': path.resolve(EMPTY_DIR, 'promises.ts'),
      'node:fs': EMPTY,
      'node:fs/promises': path.resolve(EMPTY_DIR, 'promises.ts'),
      path: EMPTY,
      'node:path': EMPTY,
      os: EMPTY,
      'node:os': EMPTY,
      http: EMPTY,
      https: EMPTY,
      stream: EMPTY,
      'node:stream': EMPTY,
      url: EMPTY,
      zlib: EMPTY,
      util: EMPTY,
      assert: EMPTY,
      constants: EMPTY,
      child_process: EMPTY,
      'node:child_process': EMPTY,
      'node:events': EMPTY,
      'node:process': EMPTY,

      'electron-store': EMPTY,
      'node-fetch': EMPTY,
      'puppeteer-core': EMPTY,
      needle: EMPTY,
      'graceful-fs': EMPTY,
      which: EMPTY,
      '@modelcontextprotocol/sdk': EMPTY,

      // 念のため main/ipcRoutes を空化
      '@main/ipcRoutes': EMPTY,
      '@main/ipcRoutes/': EMPTY,
      '../../main/ipcRoutes': EMPTY,
      '../../main/ipcRoutes/': EMPTY,
    },
  },

  define: {
    'process.env': {},
    global: 'globalThis',
  },

  optimizeDeps: {
    exclude: [
      'electron-store',
      'node-fetch',
      'dotenv',
      'puppeteer-core',
      'needle',
      'graceful-fs',
      'which',
      '@modelcontextprotocol/sdk',
    ],
  },
});
