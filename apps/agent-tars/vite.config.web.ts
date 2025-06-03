// apps/agent-tars/vite.config.web.ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'  // 追加①
import tsconfigPaths from 'vite-tsconfig-paths'

// ↓ defineConfig の中身を変更します
export default defineConfig({
  root: 'src/renderer',

  build: {
    // すでに dist/web に出力する設定になっているままにします
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
      // Monaco Worker を外部扱いしないようにする（外部化リストを空に）
      external: [],
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    minify: true,
  },

  plugins: [
    react(),
    tsconfigPaths(),
    monacoEditorPlugin(/* オプションは省略可 */)  // 追加②
  ],

  // Web Service では server / preview は不要なので省略
})
