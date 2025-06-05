// 修正版: apps/agent-tars/vite.config.ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async () => {
  // ESM-only な vite-tsconfig-paths を動的 import() で読み込む
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');

  return {
    // Vite のルート。ここを src/renderer に設定している場合、
    // index.html は root フォルダ直下 (src/renderer/index.html) に置く
    root: 'src/renderer',

    // 開発サーバーの設定
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 3000,
      strictPort: true,
    },

    // `vite preview` 用の設定も同じオブジェクト内で定義する
    preview: {
      host: '0.0.0.0',
      strictPort: true,
      // たとえば Render からのアクセスを許可したいドメインがあればここに書く
      allowedHosts: ['ui-tars-desktop-my6k.onrender.com'],
    },

    // 本番ビルドの設定
    build: {
      // 出力先をプロジェクトルートからの絶対パスで指定
      outDir: path.resolve(__dirname, 'dist/web'),
      emptyOutDir: true,

      rollupOptions: {
        // ルートが 'src/renderer' なので、input は相対で書くこともできる
        // → input: 'src/renderer/index.html'
        // ここでは __dirname を使って絶対パスを明示しています
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

      // CSS を分割せず１ファイルにまとめる
      cssCodeSplit: false,
      // アセットを base64 化するしきい値 (100MB までインライン化)
      assetsInlineLimit: 100_000_000,
      // 最適化 (ミニファイ) を行う
      minify: true,
    },

    // プラグインはここでまとめて読み込む
    plugins: [
      react(),
      tsconfigPaths(),
    ],

    // （必要に応じて）エイリアスの設定などを追加
    resolve: {
      alias: {
        // 例: src を @/ として参照したい場合
        '@': path.resolve(__dirname, 'src/renderer'),
      },
    },
  };
});
