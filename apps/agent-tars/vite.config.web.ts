import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ mode }) => {
  // Load .env files
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  // Dynamically import ESM-only plugin
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');

  return {
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

      // Include commonjs and workspace modules
      commonjsOptions: {
        include: [/node_modules/, /workspace:.*/],
      },

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

    plugins: [react(), tsconfigPaths()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
      },
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-hot-toast'],
    },
  };
});
