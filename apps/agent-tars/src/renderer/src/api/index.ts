// apps/agent-tars/src/renderer/src/api/index.ts

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
  typeof window !== 'undefined' &&
  typeof window.electron?.ipcRenderer?.invoke === 'function';

// ブラウザ実行時には API キーの存在を警告
if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn(
    '[api] VITE_OPENAI_API_KEY が設定されていません。環境変数を確認してください。'
  );
}

/**
 * ブラウザ実行時（非-Electron）には OpenAI REST エンドポイントを直接呼び出す
 */
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      functions: opts.functions,
      function_call: 'auto',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[api] OpenAI API error ${response.status}: ${response.statusText}\n${text}`
    );
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message;
  const toolCall = choice?.function_call
    ? [
        {
          name: choice.function_call.name,
          arguments: choice.function_call.arguments,
        },
      ]
    : [];

  return {
    tool_calls: toolCall,
    content: choice?.content ?? '',
  };
}

// Electron 実行時は従来の IPC クライアントを使う
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
export async function askLLMTool(
  opts: AskLLMOpts
): Promise<AskLLMResult> {
  if (isElectron) {
    return (await ipcClient.askLLMTool(opts as any)) as AskLLMResult;
  } else {
    return fetchLLM(opts);
  }
}

/**
 * ツール一覧取得
 * - Electron: ipcRenderer.invoke('listTools')
 * - ブラウザ: 空配列
 */
export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  if (isElectron) {
    return ipcClient.listTools();
  } else {
    return [];
  }
}

/**
 * llm:stream イベント購読ユーティリティ
 * Electron 環境のみ有効（ブラウザでは no-op）
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  }
) => {
  if (!isElectron || !window.api) {
    return () => {};
  }
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (error: Error) => handlers.onError(error);
  const endListener = () => handlers.onEnd();

  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);

  return () => {
    window.api.off(`llm:stream:${streamId}:data`, dataListener);
    window.api.off(`llm:stream:${streamId}:error`, errorListener);
    window.api.off(`llm:stream:${streamId}:end`, endListener);
  };
};

/**
 * LLM プロバイダー一覧取得
 * - Electron: メインプロセス経由
 * - ブラウザ: 固定リスト
 */
export async function getAvailableProviders(): Promise<string[]> {
  if (isElectron) {
    return ipcClient.getAvailableProviders();
  }
  return ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}
