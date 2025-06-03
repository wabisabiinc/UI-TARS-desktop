import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Monaco Editor をいったん外して通す場合は、この行は不要です。
// import monacoEditorPlugin from 'vite-plugin-monaco-editor'

// tsconfigPaths を ESM のまま動的インポートするユーティリティ
// （あるいは静的に import tsconfigPaths from 'vite-tsconfig-paths' しても可）
export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths')

  return {
    root: 'src/renderer',
    build: {
      // ここで dist/web に出力するよう指定
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
        // 外部化が不要な場合は空の配列
        external: []
      },
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      minify: true,
    },
    plugins: [
      react(),
      tsconfigPaths()
      // Monaco を外したい場合は以下をコメントアウト
      // monacoEditorPlugin({ languageWorkers: ["json", "editor"], publicPath: "dist/web" })
    ]
    // server / preview セクションは Web Service では不要
  }
})
