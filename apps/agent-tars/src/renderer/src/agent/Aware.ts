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
  plan: PlanTask[];
}

export class Aware {
  private signal: AbortSignal;

  private readonly prompt = `
You are an AI agent responsible for analyzing the current environment and planning the next actionable step.
Return only a raw JSON object with keys:
  • reflection (string)
  • step (number)            ← current step, starting at 1
  • status (string)          ← "in-progress" for intermediate, "completed" when step equals total steps
  • plan (array of { id: string, title: string })
Do NOT wrap in markdown or include extra text.
`;

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

  /** Markdown フェンスや余計テキストを剥がして JSON を抽出 */
  private static safeParse<T>(text: string): T | null {
    const match =
      text.match(/```json\s*([\s\S]*?)```/i) ||
      text.match(/```([\s\S]*?)```/i) ||
      text.match(/{[\s\S]*}/);
    const raw = match ? match[1] || match[0] : text;
    const cleaned = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const fallback = cleaned.match(/{[\s\S]*}/);
      if (fallback) {
        try {
          return JSON.parse(fallback[0]) as T;
        } catch {}
      }
      console.warn('[Aware.safeParse] failed to parse:', cleaned);
      return null;
    }
  }

  private getDefaultResult(): AwareResult {
    return {
      reflection: 'No plan',
      step: this.agentContext.currentStep,
      status: 'in-progress',
      plan: [],
    };
  }

  public async run(): Promise<AwareResult> {
    console.log('[Aware] ▶︎ run start, aborted=', this.signal.aborted);
    if (this.signal.aborted) return this.getDefaultResult();

    // 環境情報
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    // モデル決定
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';

    // ツール一覧
    const available = (await listTools()) || [];
    const toolList = available
      .map((t) => `${t.name}: ${t.description}`)
      .join(', ');

    // プロンプト組み立て
    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Please analyze the environment and plan the next step in JSON format.',
      ),
    ];
    const apiPayload = messages.map((m) => ({
      role: m.role as 'system' | 'user',
      content: m.content,
    }));

    console.log('[Aware] → askLLMTool', { model, messages: apiPayload });
    const raw = await askLLMTool({ model, messages: apiPayload });
    const content = raw?.content || '';
    console.log('[Aware] ← askLLMTool content=', content);

    // JSON 抽出
    const parsed = Aware.safeParse<AwareResult>(content) || null;
    const resultPlan: PlanTask[] = [];
    let step = parsed?.step || 1;

    // status正規化
    let status = parsed?.status?.toLowerCase() || 'in-progress';
    if (['pending', 'executing', 'running', 'in progress'].includes(status)) {
      status = 'in-progress';
    }

    if (parsed?.plan) {
      const arr = Array.isArray(parsed.plan) ? parsed.plan : [parsed.plan];
      arr.forEach((t) => {
        if (t && typeof t.title === 'string') {
          resultPlan.push({
            ...t,
            id: typeof t.id === 'string' ? t.id : String(resultPlan.length + 1),
          });
        }
      });
    }

    // 完了判定: step >= plan.length なら completed
    if (step >= resultPlan.length && resultPlan.length > 0) {
      status = 'completed';
    } else {
      if (status === 'completed') status = 'in-progress'; // 途中で勝手にcompletedと返ってきても無効
    }

    return {
      reflection: parsed?.reflection || '',
      step,
      status,
      plan: resultPlan,
    };
  }
}
