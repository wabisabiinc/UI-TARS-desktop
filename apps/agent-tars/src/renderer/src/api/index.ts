// apps/agent-tars/src/renderer/src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

/**
 * ipcInvokeFunction:
 * - Electron 環境では本物の ipcRenderer.invoke を使用
 * - Web 環境では Express 中継 API へ fetch で実装
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

if (typeof window !== 'undefined' && typeof window.electron?.ipcRenderer?.invoke === 'function') {
  // Electron 実行時: ネイティブ IPC を利用
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(window.electron.ipcRenderer);
} else {
  // Web 実行時: /api/askLLMTool エンドポイントへ fetch
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
    if (channel === 'askLLMTool') {
      const opts = args[0] as {
        requestId: string;
        model: string;
        messages: any[];
        tools?: any[];
      };
      const res = await fetch('/api/askLLMTool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!res.ok) throw new Error(`Proxy error ${res.status}`);
      return res.json();
    }
    // その他 IPC チャンネルはダミー実装
    switch (channel) {
      case 'listTools':
      case 'listMcpTools':
      case 'listCustomTools':
        return [];
      case 'saveBrowserSnapshot':
        return { filepath: '' };
      case 'getFileContent':
        return '';
      case 'writeFile':
      case 'editFile':
        return { success: true };
      default:
        console.warn('ipcInvoke (browser stub):', channel, args);
        return undefined;
    }
  };
}

// IPC クライアント生成
export const ipcClient = createClient<Router>({ ipcInvoke: ipcInvokeFunction });

/**
 * llm:stream 用イベント購読
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  }
) => {
  if (typeof window === 'undefined' || !window.api) return () => {};
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (err: Error) => handlers.onError(err);
  const endListener = () => handlers.onEnd();
  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);
  return () => {
    if (!window.api) return;
    window.api.off(`llm:stream:${streamId}:data`, dataListener);
    window.api.off(`llm:stream:${streamId}:error`, errorListener);
    window.api.off(`llm:stream:${streamId}:end`, endListener);
  };
};
