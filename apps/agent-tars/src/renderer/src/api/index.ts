// src/renderer/src/api/index.ts

/**
 * クライアント側 LLM 呼び出しインターフェース
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface AskLLMOpts {
  model: string;
  messages: ChatMessage[];
  functions?: {
    name: string;
    description: string;
    parameters: unknown;
  }[];
  temperature?: number;
  max_tokens?: number;
}

export interface AskLLMResult {
  tool_calls: { name: string; arguments: string; id?: string }[];
  content: string;
}

/* -------------------------------------------------
 * 環境判定
 * ------------------------------------------------- */
export const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

/* -------------------------------------------------
 * ブラウザ時のキー警告
 * ------------------------------------------------- */
if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

/* -------------------------------------------------
 * /api プロキシ経由で LLM 呼び出し（Web）
 * ------------------------------------------------- */
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  const resp = await fetch('/api/generateMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`[api] Proxy error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const choice = data.choices?.[0]?.message;

  const content = choice?.content ?? data.output_text ?? '';
  const tool_calls: { name: string; arguments: string; id?: string }[] = [];
  if (choice?.function_call) {
    tool_calls.push({
      name: choice.function_call.name,
      arguments: choice.function_call.arguments,
    });
  }
  return { tool_calls, content };
}

/* -------------------------------------------------
 * Electron IPC クライアント（遅延初期化）
 * ------------------------------------------------- */
export let ipcClient: any = null;

async function initIpcClient() {
  if (ipcClient || !isElectron) return;
  try {
    type Router = import('../../../main/ipcRoutes').Router;
    const { createClient } = await import('@ui-tars/electron-ipc/renderer');
    // @ts-ignore
    const { ipcRenderer } = window.electron!;
    ipcClient = createClient<Router>({
      ipcInvoke: ipcRenderer.invoke.bind(ipcRenderer),
    });
  } catch (e) {
    console.error('[api] ipc client init failed:', e);
  }
}

/* -------------------------------------------------
 * IPC 準備ユーティリティ
 * ------------------------------------------------- */
export async function ensureIpcReady() {
  await initIpcClient();
}

/* -------------------------------------------------
 * 公開関数：LLM 呼び出し
 * ------------------------------------------------- */
export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.askLLMTool(opts as any);
  }
  return fetchLLM(opts);
}

/* -------------------------------------------------
 * 利用可能ツール一覧取得
 * ------------------------------------------------- */
export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.listTools();
  }
  // Web 環境では固定リスト or 空配列
  return [];
}

/* -------------------------------------------------
 * 利用可能プロバイダー取得
 * ------------------------------------------------- */
export async function getAvailableProviders(): Promise<string[]> {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.getAvailableProviders();
  }
  return ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}

/* -------------------------------------------------
 * ストリームイベント購読（Electron のみ）
 * ------------------------------------------------- */
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

/* -------------------------------------------------
 * ブラウザ用画像解析エンドポイントラッパー
 * ------------------------------------------------- */
export async function analyzeImageWeb(imageBase64: string): Promise<string> {
  const resp = await fetch('/api/analyzeImage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`analyzeImage API error: ${txt}`);
  }
  const data = await resp.json();
  if (!data.success) {
    throw new Error(data.error || 'analyzeImage 解析失敗');
  }
  return data.content as string;
}
