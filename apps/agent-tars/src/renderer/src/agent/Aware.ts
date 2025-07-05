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
OUTPUT MUST BE STRICT JSON ONLY. DO NOT WRAP IN ANY TEXT.
You are an AI agent responsible for analyzing the current environment and planning the next actionable step.
Return only a raw JSON object with the following keys:
  • reflection (string)
  • step (number)            ← current step, starting at 1
  • status (string)          ← "in-progress" for intermediate steps, "completed" **MUST BE SET if step is equal to the number of items in plan**
  • plan (array of { id: string, title: string })

RULE: When "step" is equal to plan.length, set "status" to "completed".  
For all other steps, set "status" to "in-progress".  
Do NOT wrap your output in markdown or include any extra text or explanation.
`.trim();

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

  /** Markdown フェンスやテキストの飾りを剥がし、純粋な JSON を抽出してパース */
  private static safeParse<T>(text: string): T | null {
    const trimmed = text.trim();

    // 1) まず丸ごと parse を試みる
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // 失敗したらフェンスやインラインを探す
    }

    // 2) ```json ... ```, ``` ... ```, または { ... } をキャプチャ
    const fenceJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const fence = trimmed.match(/```([\s\S]*?)```/i);
    const inline = trimmed.match(/(\{[\s\S]*\})/);

    const raw = fenceJson
      ? fenceJson[1]
      : fence
        ? fence[1]
        : inline
          ? inline[1]
          : trimmed;

    // 3) エスケープ処理を解除して再パース
    const cleaned = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      console.warn(
        '[Aware.safeParse] failed to parse cleaned JSON:',
        cleaned,
        e,
      );
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

    // 1) 環境情報取得
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    // 2) モデル・ツールリスト準備
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';
    const available = (await listTools()) || [];
    const toolList = available
      .map((t) => `${t.name}: ${t.description}`)
      .join(', ');

    // 3) プロンプト組み立て → LLM 呼び出し
    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Please analyze the environment and plan the next step in JSON format.',
      ),
    ];
    console.log('[Aware] → askLLMTool', { model, messages });
    const raw = await askLLMTool({
      model,
      messages: messages.map((m) => ({
        role: m.role as any,
        content: m.content,
      })),
    });
    const content = raw?.content?.trim() || '';
    console.log('[Aware] ← askLLMTool content=', content);

    // safeParse が null を返したらフォールバック
    const parsed = Aware.safeParse<AwareResult>(content);
    if (!parsed) {
      return {
        reflection: '',
        step: 1,
        status: 'completed',
        plan: [
          {
            id: '1',
            title: content,
          },
        ],
      };
    }

    // 4) 通常の JSON パース成功時
    const resultPlan: PlanTask[] = [];
    let step = parsed.step || 1;
    let status = parsed.status.toLowerCase();
    if (['pending', 'executing', 'running', 'in progress'].includes(status)) {
      status = 'in-progress';
    }
    if (parsed.plan) {
      const arr = Array.isArray(parsed.plan) ? parsed.plan : [parsed.plan];
      arr.forEach((t) => {
        if (t && typeof t.title === 'string') {
          resultPlan.push({
            ...t,
            id: typeof t.id === 'string' ? t.id : `${resultPlan.length + 1}`,
          });
        }
      });
    }
    // 最終ステップ到達時は必ず completed
    if (step >= resultPlan.length && resultPlan.length > 0) {
      status = 'completed';
    } else if (status === 'completed') {
      status = 'in-progress';
    }

    return {
      reflection: parsed.reflection || '',
      step,
      status,
      plan: resultPlan,
    };
  }
}
