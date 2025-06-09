import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      tsconfigPaths(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
      },
    },
  };
});
