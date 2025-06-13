// apps/agent-tars/src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

/**
 * ipcInvokeFunction:
 * - Electron 環境では本物の ipcRenderer.invoke を使用
 * - ブラウザ環境では全ての IPC 呼び出しをスタブ（何もしない）実装に置き換え
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

if (
  typeof window !== 'undefined' &&
  typeof window.electron?.ipcRenderer?.invoke === 'function'
) {
  // Electron 実行時: 本物の IPC をそのまま利用
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer,
  );
} else {
  // ブラウザ実行時: 全チャンネルをダミー実装
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
    console.log('[ipcStub] invoked channel:', channel, 'args:', args);
    switch (channel) {
      case 'askLLMTool':
        // LLM 呼び出しも何もしない
        return { tool_calls: [], content: '' };

      case 'listTools':
      case 'listMcpTools':
      case 'listCustomTools':
        // ツール一覧は空配列で返す
        return [];

      case 'saveBrowserSnapshot':
        return { filepath: '' };

      case 'getFileContent':
        return '';

      case 'writeFile':
      case 'editFile':
        return { success: true };

      default:
        console.warn('ipcInvoke called in browser (no-op):', channel, args);
        return undefined;
    }
  };
}

// createClient でクライアントを生成
export const ipcClient = createClient<Router>({
  ipcInvoke: ipcInvokeFunction,
});

/**
 * llm:stream イベント購読用ユーティリティ
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  },
) => {
  if (typeof window === 'undefined' || !window.api) {
    return () => {};
  }
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (error: Error) => handlers.onError(error);
  const endListener = () => handlers.onEnd();

  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);

  return () => {
    if (window.api) {
      window.api.off(`llm:stream:${streamId}:data`, dataListener);
      window.api.off(`llm:stream:${streamId}:error`, errorListener);
      window.api.off(`llm:stream:${streamId}:end`, endListener);
    }
  };
};
