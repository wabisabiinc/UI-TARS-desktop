// apps/agent-tars/vite.config.web.ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'  
import react from '@vitejs/plugin-react'

// ↓ defineConfig の中身を変更します
export default defineConfig(async () => {
  const { default : tsconfigPaths } = await import('vite-tsconfig-paths')

  return {
    root: 'src/renderer',

    build: {
      outDir: path.resolve(__dirname, 'dist/web'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name][extname]',
        },
        external: [],
      },
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      minify: true,
    },

    plugins: [
      react(),
      tsconfigPaths(),
      monacoEditorPlugin()
    ],

    // server / preview は Web Service では不要なので省略
  }
})