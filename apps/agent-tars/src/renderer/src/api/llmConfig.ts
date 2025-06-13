// apps/agent-tars/src/renderer/src/api/llmConfig.ts

/**
 * LLM プロバイダー一覧取得ユーティリティ
 * - Electron: メインプロセス経由でリアルな一覧を取得
 * - ブラウザ（Render URL など）: 固定リストを返す
 */
export { getAvailableProviders } from './index';
