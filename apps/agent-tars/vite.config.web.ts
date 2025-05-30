// vite.config.web.ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // ソースのルート
  root: 'src/renderer',
  // デフォルトで読み込むホストとポート
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  build: {
    // Web 用成果物を dist/web に出力
    outDir: path.resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
      output: {
        // SPA 一体化ビルド向け設定など
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
})
