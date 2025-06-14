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
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

// ブラウザ実行時には API キーの存在を警告
if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn(
    '[api] VITE_OPENAI_API_KEY が設定されていません。環境変数を確認してください。'
  );
}

/**
 * ブラウザ実行時（非-Electron）には
 * - Gemini via プロキシ
 * - OpenAI REST API
 * を自動切り替えで呼び出す
 */
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  const key = opts.model.toLowerCase();

  // --- Gemini モード: プロキシ経由 ---
  if (key.startsWith('gemini')) {
    // contents 配列を構築
    const contents = opts.messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
    const resp = await fetch('/api/generateMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, contents }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`[api] Gemini proxy error ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    // Google Gemini は data.candidates や data.choices に結果が入る場合がある
    const content =
      data.candidates?.[0]?.content ??
      data.choices?.[0]?.message?.content ??
      '';
    return { tool_calls: [], content };
  }

  // --- OpenAI GPT 系モード ---
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
      // 明示的に aware_analysis を呼び出す
      function_call: { name: opts.functions![0].name },
    }),
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`[api] OpenAI API error ${response.status}: ${txt}`);
  }
  const json = await response.json();
  const choice = json.choices?.[0]?.message;
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
export async function askLLMTool(
  opts: AskLLMOpts
): Promise<AskLLMResult> {
  return isElectron
    ? (await ipcClient.askLLMTool(opts as any)) as AskLLMResult
    : fetchLLM(opts);
}

/**
 * ツール一覧取得
 * - Electron: ipcRenderer.invoke('listTools')
 * - ブラウザ: 空配列
 */
export async function listTools(): Promise<{
  name: string;
  description: string;
}[]> {
  return isElectron ? ipcClient.listTools() : [];
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
  }
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
    ? ipcClient.getAvailableProviders()
    : ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}
