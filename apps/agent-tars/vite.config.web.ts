// apps/agent-tars/vite.config.web.ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(async () => {
  // ESM-only な vite-tsconfig-paths を動的 import() で読み込む
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths')

  return {
    root: 'src/renderer',
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 3000,
      strictPort: true,
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/web'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
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
  
    preview: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 10000,
      strictPort: true,
      allowedHosts: ['ui-tars-desktop-my6k.onrender.com'],
    },
  }
})
