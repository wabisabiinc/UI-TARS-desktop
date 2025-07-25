// src/renderer/src/api/index.ts

/** LLM 呼び出しの型定義 **/
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
  function_call?: any; // ← function_call を追加
  temperature?: number;
  max_tokens?: number;
}
export interface AskLLMResult {
  tool_calls: { name: string; arguments: string; id?: string }[];
  content: string;
}

/* -------------------------------------------------
 * 環境判定 & キー警告
 * ------------------------------------------------- */
export const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

/* -------------------------------------------------
 * function_callとfunctionsの整合性を保証する関数
 * ------------------------------------------------- */
function sanitizeLLMOpts(opts: AskLLMOpts): AskLLMOpts {
  const clean = { ...opts };
  if (!opts.functions || opts.functions.length === 0) {
    delete clean.functions;
    if ((clean as any).function_call) delete (clean as any).function_call;
  }
  return clean;
}

/* -------------------------------------------------
 * /api/generateMessage プロキシ呼び出し（Web）
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
export async function ensureIpcReady() {
  await initIpcClient();
}

/* -------------------------------------------------
 * askLLMTool（Electron/Web 両対応、function_call安全化版）
 * ------------------------------------------------- */
export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  const safeOpts = sanitizeLLMOpts(opts);
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.askLLMTool(safeOpts as any);
  }
  return fetchLLM(safeOpts);
}

/* -------------------------------------------------
 * listTools / getAvailableProviders
 * ------------------------------------------------- */
export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.listTools();
  }
  return [];
}
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
 * analyzeImageWeb（Web 版画像＋プロンプト解析ラッパー）
 * ------------------------------------------------- */
/**
 * @param image 完全な Data URL ('data:image/png;base64,…')
 * @param prompt 画像解析に対する追加指示テキスト
 */
export async function analyzeImageWeb(
  image: string,
  prompt?: string,
): Promise<string> {
  const resp = await fetch('/api/analyzeImage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, prompt }),
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
