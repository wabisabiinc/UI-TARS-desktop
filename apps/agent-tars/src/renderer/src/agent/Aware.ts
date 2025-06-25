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

/**
 * Aware: Ambient World Analysis and Response Engine
 * Robust JSON extraction & parsing
 */
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

  /** 外部からAbortSignalを更新できるようにする */
  updateSignal(signal: AbortSignal) {
    this.signal = signal;
  }

  // より強力なJSON抽出・パース関数
  private static safeParse<T>(text: string): T | null {
    // 1. ```json ... ``` コードブロック優先で抜き出し
    let match =
      text.match(/```json\s*([\s\S]*?)```/i) ||
      text.match(/```([\s\S]*?)```/i) ||
      text.match(/{[\s\S]*}/);
    let cleaned = match ? match[1] || match[0] : '';
    if (!cleaned) {
      // 最後の手段として全体から{}だけ拾う
      const curlyMatch = text.match(/{[\s\S]*}/);
      if (curlyMatch) {
        cleaned = curlyMatch[0];
      } else {
        console.warn('safeParse: no JSON block found', text);
        return null;
      }
    }
    try {
      // 余計なバックスラッシュや改行、エスケープを吸収
      cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"');
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

    // Gather environment context
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );
    console.log('[Aware] envInfo=', envInfo);

    // Choose model
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';

    // Get available tools for info only
    const available = (await listTools()) || [];
    const toolList = available
      .map((t) => `${t.name}: ${t.description}`)
      .join(', ');

    // Build messages
    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Please analyze the environment and plan the next step in JSON format.',
      ),
    ];

    // API用メッセージ変換
    const messagesForAPI = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    console.log('[Aware] → askLLMTool', { model, messages: messagesForAPI });
    const raw = await askLLMTool({ model, messages: messagesForAPI });
    const content = raw?.content || '';
    console.log('[Aware] ← askLLMTool content=', content);

    // JSON抽出してパース
    const parsed = Aware.safeParse<AwareResult>(content);
    console.log('[Aware] parsed LLM JSON:', parsed);

    // planプロパティを徹底補正
    let plan: PlanTask[] = [];
    if (parsed && Array.isArray(parsed.plan)) {
      plan = parsed.plan;
    } else if (parsed && parsed.plan && typeof parsed.plan === 'object') {
      // 配列でなくobjectなら1件だけとして配列化
      plan = [parsed.plan as any];
    } else {
      plan = [];
    }
    // planが要件を満たしているか型チェック
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
