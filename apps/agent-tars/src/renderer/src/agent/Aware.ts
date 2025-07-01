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

  // “生の JSON のみ”を必ず返すように指示を強化
  private readonly prompt = `
You are an AI agent responsible for analyzing the current environment and planning the next actionable step.
Return only a raw JSON object with keys:
  • reflection (string)
  • step (number)
  • status (string)
  • plan (array of { id: string, title: string })
Do NOT wrap your output in markdown code fences or include any additional explanation.
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

  /** 柔軟に Markdown フェンスや余計なテキストを剥がして JSON を抽出 */
  private static safeParse<T>(text: string): T | null {
    // 1) ```json ... ```、``` ... ```, または { ... } を抽出
    const match =
      text.match(/```json\s*([\s\S]*?)```/i) ||
      text.match(/```([\s\S]*?)```/i) ||
      text.match(/{[\s\S]*}/);
    const raw = match ? match[1] || match[0] : text;

    // 2) エスケープ文字を戻し、前後空白削除
    const cleaned = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e1) {
      // フォールバックでもう一度抽出→parse
      const fallback = cleaned.match(/{[\s\S]*}/);
      if (fallback) {
        try {
          return JSON.parse(fallback[0]) as T;
        } catch {}
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
    console.log('[Aware] ▶ run start, aborted=', this.signal.aborted);
    if (this.signal.aborted) return this.getDefaultResult();

    // 環境情報取得
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );
    console.log('[Aware] envInfo=', envInfo);

    // モデル選択
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';

    // 利用可能ツール一覧
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

    // JSON を安全に抽出
    const parsed = Aware.safeParse<AwareResult>(content);
    console.log('[Aware] parsed JSON:', parsed);

    // plan の補正＆フィルタリング
    let plan: PlanTask[] = [];
    if (parsed && Array.isArray(parsed.plan)) {
      plan = parsed.plan;
    } else if (parsed?.plan) {
      plan = [parsed.plan as any];
    }
    plan = plan.filter(
      (t) => t && typeof t === 'object' && typeof t.title === 'string',
    );
    console.log('[Aware] final plan:', plan);

    if (parsed) {
      return { ...parsed, plan };
    } else {
      console.warn('[Aware] parse failed, returning default');
      return this.getDefaultResult();
    }
  }
}
