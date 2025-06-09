import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';
import { openai } from './llmConfig';
import { Client as GeminiClient } from '@google/genai';

// ブラウザフォールバック用に gemini のクライアントを再初期化
const gemini = new GeminiClient({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY as string,
});


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
  // Electron: IPC renderer 経由
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  // Browser: フォールバック実装
  ipcInvokeFunction = async (channel: keyof Router, ...args: any[]) => {
    switch (channel) {
      case 'askLLMTool': {
        const opts = args[0] as {
          requestId: string;
          model: string;
          messages: any[];
          tools?: any[];
        };
        // GPT 系モデルは OpenAI
        if (opts.model.startsWith('gpt')) {
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
        // Gemini 系モデルは Gemini クライアント
        if (opts.model.startsWith('gemini')) {
          const prompt = opts.messages.map(m => m.content || '').join('\n');
          const res = await gemini.generateText({
            model: opts.model,
            prompt,
          });
          return {
            tool_calls: [],
            content: res.text ?? '',
          };
        }
        // デフォルト: OpenAI
        const fallback = await openai.chat.completions.create({
          model: opts.model,
          messages: opts.messages,
          functions: opts.tools,
          function_call: 'auto',
        });
        const msg = fallback.choices?.[0]?.message;
        return {
          tool_calls: msg?.function_call
            ? [{ function: msg.function_call }]
            : [],
          content: msg?.content,
        };
      }
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

// createClient でクライアント生成
export const ipcClient = createClient<Router>({ ipcInvoke: ipcInvokeFunction });

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
