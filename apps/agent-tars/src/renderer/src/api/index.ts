// apps/agent-tars/src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';
//import { openai, gemini } from './llmConfig';


/**
 * ipcInvokeFunction:
 * - Electron 環境では本物の ipcRenderer.invoke を使用
 * - ブラウザ環境では OpenAI/Gemini クライアントを直接呼び出す
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

if (
  typeof window !== 'undefined' &&
  typeof window.electron?.ipcRenderer?.invoke === 'function'
) {
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
    switch (channel) {
      case 'askLLMTool': {
        // args[0] は { requestId, model, messages, tools }
        const opts = args[0] as {
          requestId: string;
          model: string;
          messages: any[];
          tools?: any[];
        };
        const response = await openai.chat.completions.create({
          model: opts.model,
          messages: opts.messages,
          functions: opts.tools,
          function_call: 'auto',
        });
        const message = response.choices?.[0]?.message;
        return {
          tool_calls: message?.function_call
            ? [{ function: message.function_call }]
            : [],
          content: message?.content,
        };
      }
      case 'listTools':
      case 'listMcpTools':
      case 'listCustomTools':
        // ツール一覧は空配列でフォールバック
        return [];
      case 'saveBrowserSnapshot':
        return { filepath: '' };
      case 'getFileContent':
        // ファイル読み取りは空文字でフォールバック
        return '';
      default:
        console.warn(
          'ipcInvoke called in browser (no-op):',
          channel,
          args
        );
        return undefined;
    }
  };
}

export const ipcClient = createClient<Router>({
  ipcInvoke: ipcInvokeFunction,
});

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
