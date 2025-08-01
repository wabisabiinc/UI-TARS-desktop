/** LLM 呼び出しの型定義 **/
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any; // Vision対応: 配列もOK
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
  function_call?: any;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
export interface AskLLMResult {
  tool_calls?: { name: string; arguments: string; id?: string }[];
  content: string;
}

// 環境判定
export const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

// function_call/functionsを省略可能
function sanitizeLLMOpts(opts: AskLLMOpts): AskLLMOpts {
  const clean = { ...opts };
  if (!opts.functions || opts.functions.length === 0) {
    delete clean.functions;
    if ((clean as any).function_call) delete (clean as any).function_call;
  }
  return clean;
}

// /api/generateMessage呼び出し（タイムアウトを60秒に延長）
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 60000); // ← タイムアウト60秒に設定
  try {
    const resp = await fetch('/api/generateMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`[api] Proxy error ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    const content = choice?.content ?? data.output_text ?? '';
    const tool_calls = choice?.function_call
      ? [
          {
            name: choice.function_call.name,
            arguments: choice.function_call.arguments,
          },
        ]
      : [];
    return { tool_calls, content };
  } finally {
    clearTimeout(id);
  }
}

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

export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  const safeOpts = sanitizeLLMOpts(opts);
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.askLLMTool(safeOpts as any);
  }
  return fetchLLM(safeOpts);
}

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

// Vision: Web経由で画像解析（DataURL＋プロンプト）
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

export async function analyzeImage(path: string): Promise<string> {
  if (isElectron) {
    await ensureIpcReady();
    return ipcClient.analyzeImage({ path });
  }
  throw new Error('Web環境ではanalyzeImageは使えません');
}
