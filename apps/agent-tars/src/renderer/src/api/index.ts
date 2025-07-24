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

export const isElectron =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

if (!isElectron && !import.meta.env.VITE_OPENAI_API_KEY) {
  console.warn('[api] VITE_OPENAI_API_KEY が未設定です。');
}

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
  let tool_calls = [];
  if (choice?.function_call) {
    tool_calls.push({
      name: choice.function_call.name,
      arguments: choice.function_call.arguments,
    });
  }
  return { tool_calls, content };
}

export let ipcClient: any = null;
async function initIpcClient() {
  if (ipcClient || !isElectron) return;
  try {
    const { createClient } = await import('@ui-tars/electron-ipc/renderer');
    // @ts-ignore
    const { ipcRenderer } = window.electron!;
    ipcClient = createClient({
      ipcInvoke: ipcRenderer.invoke.bind(ipcRenderer),
    });
  } catch (e) {
    console.error('[api] ipc init failed:', e);
  }
}

export async function ensureIpcReady() {
  await initIpcClient();
}

export async function askLLMTool(opts: AskLLMOpts): Promise<AskLLMResult> {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.askLLMTool(opts);
  }
  return fetchLLM(opts);
}

export async function listTools() {
  if (isElectron) {
    await ensureIpcReady();
    if (ipcClient) return ipcClient.listTools();
  }
  return [];
}

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
    throw new Error(data.error || 'analyzeImage failure');
  }
  return data.content;
}
