// apps/agent-tars/src/renderer/src/agent/Aware.ts
import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
import { askLLMTool, listTools } from '../api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { PlanTask } from '@renderer/type/agent';

export interface AwareResult {
  reflection: string;
  step: number;
  status: string;
  plan?: PlanTask[];
}

export class Aware {
  private signal: AbortSignal;

  private readonly prompt =
    'You are an AI agent responsible for analyzing the current environment and planning the next actionable step. ' +
    'Return only a JSON object with keys: reflection (string), step (number), status (string), plan (array of {id:string,title:string}).';

  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    abortSignal: AbortSignal,
  ) {
    this.signal = abortSignal;
  }

  updateSignal(signal: AbortSignal) {
    this.signal = signal;
  }

  private static safeParse<T>(text: string): T | null {
    let cleaned = text.trim();
    // 先頭・末尾のコードブロックを強制的に除去
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }
    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      console.warn('[Aware.safeParse] JSON.parse failed:', e, cleaned);
      return null;
    }
  }

  private getDefaultResult(): AwareResult {
    return {
      reflection: 'No plan',
      step: this.agentContext.currentStep,
      status: 'No plan',
      plan: [],
    };
  }

  public async run(): Promise<AwareResult> {
    console.log('[Aware] ▶︎ run start, aborted=', this.signal.aborted);
    if (this.signal.aborted) {
      return this.getDefaultResult();
    }

    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );
    console.log('[Aware] envInfo=', envInfo);

    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';

    const available = (await listTools()) || [];
    const toolList = available
      .map((t) => `${t.name}: ${t.description}`)
      .join(', ');

    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Please analyze the environment and plan the next step in JSON format.',
      ),
    ];

    const messagesForAPI = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    console.log('[Aware] → askLLMTool', { model, messages: messagesForAPI });
    const raw = await askLLMTool({ model, messages: messagesForAPI });
    const content = raw?.content || '';
    console.log('[Aware] ← askLLMTool content=', content);

    // ▼ パース前のログも出す
    if (!content) {
      console.warn('[Aware] No content returned from LLM');
      return this.getDefaultResult();
    }

    const parsed = Aware.safeParse<AwareResult>(content);

    if (parsed && Array.isArray(parsed.plan)) {
      return {
        ...parsed,
        plan: parsed.plan,
      };
    } else if (parsed) {
      return {
        ...parsed,
        plan: [],
      };
    }

    console.warn(
      '[Aware] Failed to parse JSON, returning default. content=',
      content,
    );
    return this.getDefaultResult();
  }
}
