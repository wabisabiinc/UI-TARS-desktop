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
}

export interface ToolCall {
  name: string;
  arguments: string;
  id?: string;
}

export interface AskLLMResult {
  tool_calls: ToolCall[];
  content: string;
}

/* -------------------------------------------------
 * 環境判定
 * ------------------------------------------------- */
const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

/* -------------------------------------------------
 * ブラウザ時のキー警告
 * ------------------------------------------------- */
if (!isElectron && !import.meta.env?.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

/* -------------------------------------------------
 * /api プロキシ経由で LLM 呼び出し（Web）
 * ------------------------------------------------- */
async function fetchLLM(opts: AskLLMOpts): Promise<AskLLMResult> {
  const resp = await fetch('/api/generateMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      functions: opts.functions,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`[api] Proxy error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();

  const choice = data.choices?.[0]?.message ?? data.output?.[0]?.content?.[0];
  let content = '';

  if (choice?.content) {
    content =
      typeof choice.content === 'string'
        ? choice.content
        : choice.content.map((c: any) => c.text ?? '').join('');
  } else if (data.output_text) {
    content = data.output_text;
  }

  let tool_calls: ToolCall[] = [];

  if (choice?.tool_calls?.length) {
    tool_calls = choice.tool_calls.map((t: any) => ({
      id: t.id,
      name: t.function?.name ?? t.name,
      arguments: t.function?.arguments ?? t.arguments ?? '{}',
    }));
  }

  if (choice?.function_call) {
    tool_calls.push({
      name: choice.function_call.name,
      arguments: choice.function_call.arguments,
    });
  }

  if (Array.isArray(data.output)) {
    const tools = data.output.filter((o: any) => o.type === 'tool_call');
    if (tools.length) {
      tool_calls = tools.map((t: any) => ({
        id: t.id,
        name: t.name,
        arguments: JSON.stringify(t.arguments ?? {}),
      }));
    }
  }

  return { tool_calls, content };
}

/* -------------------------------------------------
 * Electron IPC クライアント（遅延初期化で TLA を回避）
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
 * 公開関数
 * ------------------------------------------------- */
export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  if (isElectron) await ensureIpcReady();
  if (isElectron && ipcClient) return ipcClient.askLLMTool(opts as any);
  return fetchLLM(opts);
}

export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  if (isElectron) await ensureIpcReady();
  return isElectron && ipcClient ? ipcClient.listTools() : [];
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

export async function getAvailableProviders(): Promise<string[]> {
  if (isElectron) await ensureIpcReady();
  return isElectron && ipcClient
    ? ipcClient.getAvailableProviders()
    : ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}
