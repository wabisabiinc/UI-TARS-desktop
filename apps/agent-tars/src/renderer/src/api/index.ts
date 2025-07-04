/**
 * クライアント側 LLM 呼び出しインターフェース
 */
export interface AskLLMOpts {
  model: string;
  messages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[];
  functions?: {
    name: string;
    description: string;
    parameters: unknown;
  }[];
}

export interface AskLLMResult {
  tool_calls: { name: string; arguments: string }[];
  content: string;
}

// Electron 環境判定
const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

// ブラウザ実行時には API キーの存在を警告
if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn(
    '[api] VITE_OPENAI_API_KEY が設定されていません。環境変数を確認してください。',
  );
}

/**
 * 内部： /api プロキシ経由で LLM を呼び出す
 */
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  // ✅ ここを「messages」に修正（OpenAI互換APIのため）
  const resp = await fetch('/api/generateMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages, // ← OpenAI chat-completionsそのまま！
      functions: opts.functions,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`[api] Proxy error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  // OpenAI の chat API 形式でパース
  const choice = data.choices?.[0]?.message;
  const tool_calls = choice?.function_call
    ? [
        {
          name: choice.function_call.name,
          arguments: choice.function_call.arguments,
        },
      ]
    : [];

  return {
    tool_calls,
    content: choice?.content ?? '',
  };
}

// Electron 実行時: IPC クライアントを使用
import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';
const { ipcRenderer } = window.electron!;
export const ipcClient = createClient<Router>({
  ipcInvoke: ipcRenderer.invoke.bind(ipcRenderer),
});

/**
 * askLLMTool:
 * - Electron: ipcRenderer.invoke('askLLMTool', opts)
 * - ブラウザ: fetchLLM(opts)
 */
export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  if (isElectron) {
    return ipcClient.askLLMTool(opts as any);
  }
  return fetchLLM(opts);
}

/**
 * ツール一覧取得
 * - Electron: ipcRenderer.invoke('listTools')
 * - ブラウザ: 空配列
 */
export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  return isElectron ? await ipcClient.listTools() : [];
}

/**
 * llm:stream イベント購読ユーティリティ
 * Electron 実行時のみ有効（ブラウザでは no-op）
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  },
) => {
  if (!isElectron || !window.api) return () => {};
  const onData = (d: string) => handlers.onData(d);
  const onError = (e: Error) => handlers.onError(e);
  const onEnd = () => handlers.onEnd();
  window.api.on(`llm:stream:${streamId}:data`, onData);
  window.api.on(`llm:stream:${streamId}:error`, onError);
  window.api.on(`llm:stream:${streamId}:end`, onEnd);
  return () => {
    window.api.off(`llm:stream:${streamId}:data`, onData);
    window.api.off(`llm:stream:${streamId}:error`, onError);
    window.api.off(`llm:stream:${streamId}:end`, onEnd);
  };
};

/**
 * LLM プロバイダー一覧取得
 */
export async function getAvailableProviders(): Promise<string[]> {
  return isElectron
    ? await ipcClient.getAvailableProviders()
    : ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}
