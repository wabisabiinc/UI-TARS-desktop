import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';


export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');

  return {
    // ✅ base追加：HTMLからの相対パス参照を正しく
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
      allowedHosts: ['localhost','ui-tars-desktop-my6k.onrender.com'],
    },

    build: {
      outDir: path.resolve(__dirname, 'dist/web'),
      emptyOutDir: true,
      sourcemap : true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),

        // ✅ electron系をバンドルから除外（重要）
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

    plugins: [
      react(),
      tsconfigPaths({ rootMode: 'upward' }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        '@vendor/chat-ui': path.resolve(__dirname,'src/vendor/chat-ui'),
        '@vendor/chat-ui/': path.resolve(__dirname, 'src/vendor/chat-ui') + '/',
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@shared/': path.resolve(__dirname, 'src/shared') + '/',
        '@main': path.resolve(__dirname, 'src/main'),
        '@main/': path.resolve(__dirname, 'src/main') + '/',
        '@resources': path.resolve(__dirname, 'src/resources'),
        '@resources/': path.resolve(__dirname, 'src/resources') + '/',
        '@renderer/api': path.resolve(__dirname,'src/renderer/src/api'),
        '@renderer/api/': path.resolve(__dirname,'src/renderer/src/api') + '/',
      },
    },
  };
});
