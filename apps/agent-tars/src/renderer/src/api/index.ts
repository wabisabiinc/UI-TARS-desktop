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
    window.electron.ipcRenderer
  );
} else {
  // ブラウザ実行時: 全チャンネルをダミー実装
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
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
  }
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
// apps/agent-tars/src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

/**
 * ipcInvokeFunction:
 * - Electron 環境では本物の ipcRenderer.invoke を使用
 * - Web（ブラウザ）環境では /api/askLLMTool へ fetch で中継
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

if (
  typeof window !== 'undefined' &&
  typeof window.electron?.ipcRenderer?.invoke === 'function'
) {
  // Electron 実行時: 本物の IPC
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  // Web 実行時: Express サーバの中継エンドポイントへ fetch
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
    if (channel === 'askLLMTool') {
      // args[0] は { requestId, model, messages, tools }
      const opts = args[0] as {
        requestId: string;
        model: string;
        messages: any[];
        tools?: any[];
      };
      const res = await fetch('/api/askLLMTool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: opts.requestId,
          model: opts.model,
          messages: opts.messages,
          tools: opts.tools,
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM proxy error: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    }

    // その他の IPC チャンネルは従来どおりスタブで返す
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
        console.warn('ipcInvoke called in browser (no-op):', channel, args);
        return undefined;
    }
  };
}

// createClient で IPC クライアントを生成
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
  }
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
