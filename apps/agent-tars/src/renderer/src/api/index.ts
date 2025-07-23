/**
 * クライアント側 LLM 呼び出しインターフェース
 * apps/agent-tars/src/renderer/src/api/index.ts
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
 *  環境判定
 * ------------------------------------------------- */
const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

/* -------------------------------------------------
 *  ブラウザ時のキー警告
 * ------------------------------------------------- */
if (!isElectron && !import.meta.env?.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

/* -------------------------------------------------
 *  /api プロキシ経由で LLM 呼び出し（ブラウザ用）
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

  // ---- OpenAI / Responses API / ChatCompletion など色々来る可能性があるので吸収 ----
  // OpenAI ChatCompletion 形式
  const choice = data.choices?.[0]?.message ?? data.output?.[0]?.content?.[0];
  let content = '';

  if (choice?.content) {
    content =
      typeof choice.content === 'string'
        ? choice.content
        : // responses.create の場合 array になる
          choice.content.map((c: any) => c.text ?? '').join('');
  } else if (data.output_text) {
    // responses.create のショートカット
    content = data.output_text;
  }

  let tool_calls: ToolCall[] = [];

  // ChatCompletionToolCalls (gpt-4o 系)
  if (choice?.tool_calls?.length) {
    tool_calls = choice.tool_calls.map((t: any) => ({
      id: t.id,
      name: t.function?.name ?? t.name,
      arguments: t.function?.arguments ?? t.arguments ?? '{}',
    }));
  }

  // function_call (旧)
  if (choice?.function_call) {
    tool_calls.push({
      name: choice.function_call.name,
      arguments: choice.function_call.arguments,
    });
  }

  // responses.create の "tool" 出力に対応
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
 *  Electron IPC クライアント
 * ------------------------------------------------- */
let ipcClient: any = null;
if (isElectron) {
  // lazy import 防止用 try-catch
  try {
    const { createClient } = await import('@ui-tars/electron-ipc/renderer');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { ipcRenderer } = window.electron!;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Router } = await import('../../../main/ipcRoutes'); // 型だけ参照したい場合は typeof import(...) に変更可
    ipcClient = createClient<typeof Router>({
      ipcInvoke: ipcRenderer.invoke.bind(ipcRenderer),
    });
  } catch (e) {
    console.error('[api] ipc client init failed:', e);
  }
}

/* -------------------------------------------------
 *  公開関数：askLLMTool
 * ------------------------------------------------- */
export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  if (isElectron && ipcClient) {
    return ipcClient.askLLMTool(opts as any);
  }
  return fetchLLM(opts);
}

/* -------------------------------------------------
 *  ツール一覧
 * ------------------------------------------------- */
export async function listTools(): Promise<
  { name: string; description: string }[]
> {
  if (isElectron && ipcClient) {
    return ipcClient.listTools();
  }
  // ブラウザのみの場合はバックエンド無し想定なので空
  return [];
}

/* -------------------------------------------------
 *  ストリームイベント購読（Electronのみ）
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
 *  利用可能プロバイダー取得
 * ------------------------------------------------- */
export async function getAvailableProviders(): Promise<string[]> {
  if (isElectron && ipcClient) {
    return ipcClient.getAvailableProviders();
  }
  // ブラウザ実行のみのときは固定
  return ['anthropic', 'openai', 'azure_openai', 'deepseek'];
}
