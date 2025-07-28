// ✅ Aware.ts 修正済み完全版
import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
import {
  askLLMTool,
  ipcClient,
  ensureIpcReady,
  onMainStreamEvent,
} from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { PlanTask } from '@renderer/type/agent';
import { MessageType } from '@vendor/chat-ui';
import { globalEventEmitter } from '@renderer/state/chat';

export interface AwareResult {
  reflection: string;
  step: number;
  status: 'in-progress' | 'completed' | 'failed';
  plan: PlanTask[];
  summary?: string;
}

export class Aware {
  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal,
  ) {}

  public async run(): Promise<AwareResult> {
    const input = this.appContext.request.inputText;

    const systemPrompt = `
You are a high-level planning AI assistant. Your job:
- Analyze the user input.
- Break down the task into a step-by-step plan.
- Reflect why this plan is reasonable.
- Format the result in the structure: { reflection, step, status, plan }
Answer in JSON only.
`.trim();

    const userPrompt = `
Analyze the following user request and create a step-by-step plan.

【User Request】
${input}
`.trim();

    const fallbackResult: AwareResult = {
      reflection: '',
      status: 'completed',
      step: 0,
      plan: [],
      summary:
        'AIの応答内容を解釈できなかったため、安全のため処理を終了しました。',
    };

    try {
      const result = await askLLMTool({
        model: import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o',
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(userPrompt),
        ],
      });

      const parsed = this.parseAwareResult(result?.content ?? '');
      return parsed;
    } catch (err) {
      console.warn('[Aware] Failed to parse result:', err);
      return fallbackResult;
    }
  }

  private parseAwareResult(jsonStr: string): AwareResult {
    try {
      const obj = JSON.parse(jsonStr.trim());
      const plan: PlanTask[] = Array.isArray(obj.plan)
        ? obj.plan.map((p: any, i: number) => ({
            id: p.id ?? `${i + 1}`,
            title: p.step ?? p.title ?? `Step ${i + 1}`,
            status: (p.status as PlanTask['status']) ?? 'Todo',
          }))
        : [];

      return {
        reflection: typeof obj.reflection === 'string' ? obj.reflection : '',
        step: typeof obj.step === 'number' ? obj.step : plan.length,
        status:
          obj.status === 'completed' || obj.status === 'in-progress'
            ? obj.status
            : 'completed',
        plan,
        summary: typeof obj.summary === 'string' ? obj.summary : '',
      };
    } catch (err) {
      console.warn('[Aware] Failed to parse JSON:', jsonStr);
      return {
        reflection: '',
        status: 'completed',
        step: 0,
        plan: [],
        summary:
          'AI応答の解析に失敗しましたが、安全のため完了扱いにして処理を終えます。',
      };
    }
  }
}
