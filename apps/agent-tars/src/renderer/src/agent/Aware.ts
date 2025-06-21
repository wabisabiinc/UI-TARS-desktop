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
 * Simplified: Direct JSON parsing without function calls
 */
export class Aware {
  private readonly prompt =
    'You are an AI agent responsible for analyzing the current environment and planning the next actionable step. ' +
    'Return only a JSON object with keys: reflection (string), step (number), status (string), plan (array of {id:string,title:string}).';

  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal,
  ) {}

  // ★ここを修正！コードブロックの除去ロジックを追加★
  private static safeParse<T>(text: string): T | null {
    // コードブロック（```json ... ```）があれば取り除く
    const cleaned = text
      .replace(/^\s*```json\s*/i, '') // 先頭の```jsonを除去
      .replace(/^\s*```\s*/i, '') // 先頭の```だけも除去
      .replace(/\s*```\s*$/, ''); // 末尾の```を除去

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      console.warn('JSON.parse failed:', cleaned);
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
    console.log('[Aware] ▶︎ run start, aborted=', this.abortSignal.aborted);
    if (this.abortSignal.aborted) {
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

    console.log('[Aware] → askLLMTool', { model, messages });
    const raw = await askLLMTool({ model, messages });
    const content = raw?.content || '';
    console.log('[Aware] ← askLLMTool content=', content);

    // Parse JSON response
    const parsed = Aware.safeParse<AwareResult>(content);
    if (parsed) {
      return parsed;
    }

    console.warn('Failed to parse JSON, returning default.');
    return this.getDefaultResult();
  }
}
