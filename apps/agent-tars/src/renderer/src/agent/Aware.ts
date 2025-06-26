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

  // 強化版 safeParse
  private static safeParse<T>(text: string): T | null {
    let match =
      text.match(/```json\s*([\s\S]*?)```/i) ||
      text.match(/```([\s\S]*?)```/i) ||
      text.match(/{[\s\S]*}/);

    let cleaned = match ? match[1] || match[0] : text;

    // バックスラッシュや改行・エスケープ再吸収
    cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e1) {
      // fallback: {}ブロック抽出だけでも再トライ
      const curlyMatch = cleaned.match(/{[\s\S]*}/);
      if (curlyMatch) {
        try {
          return JSON.parse(curlyMatch[0]) as T;
        } catch (e2) {
          console.warn(
            '[Aware.safeParse] fallback JSON.parse failed:',
            e2,
            curlyMatch[0],
          );
        }
      }
      console.warn('[Aware.safeParse] JSON.parse failed:', e1, cleaned);
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

    // 環境取得
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

    // 強化safeParse
    const parsed = Aware.safeParse<AwareResult>(content);
    console.log('[Aware] parsed LLM JSON:', parsed);

    // plan補正
    let plan: PlanTask[] = [];
    if (parsed && Array.isArray(parsed.plan)) {
      plan = parsed.plan;
    } else if (parsed && parsed.plan && typeof parsed.plan === 'object') {
      plan = [parsed.plan as any];
    } else {
      plan = [];
    }
    plan = plan.filter(
      (t) => t && typeof t === 'object' && typeof t.title === 'string',
    );
    console.log('[Aware] 最終plan（返却前）:', plan);

    if (parsed) {
      return {
        ...parsed,
        plan,
      };
    }
    console.warn('Failed to parse JSON, returning default.');
    return this.getDefaultResult();
  }
}
