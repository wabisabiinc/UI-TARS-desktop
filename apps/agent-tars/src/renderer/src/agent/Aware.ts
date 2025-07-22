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

  /**
   * できるだけ壊れたJSONを直してパースする。
   * - 先頭/末尾の `{ ... }` 抽出
   * - ```json ``` / ``` フェンス内抽出
   * - 改行/エスケープ調整
   * - 末尾カンマの除去 など軽微な修正
   */
  private static safeParse<T>(text: string): T | null {
    const tryParse = (s: string): T | null => {
      try {
        return JSON.parse(s) as T;
      } catch {
        return null;
      }
    };

    const trimmed = text.trim();

    // 1) そのまま
    let parsed = tryParse(trimmed);
    if (parsed) return parsed;

    // 2) コードフェンスから抽出
    const fenceJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const fence = fenceJson || trimmed.match(/```([\s\S]*?)```/i);
    if (fence) {
      parsed = tryParse(fence[1]);
      if (parsed) return parsed;
    }

    // 3) 最初と最後の波括弧で囲まれた部分を抜く
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);

      // 軽微な修正：\n, \" の戻し・末尾カンマ除去
      const cleaned = slice
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .trim();

      parsed = tryParse(cleaned);
      if (parsed) return parsed;
    }

    console.warn('[Aware.safeParse] failed to parse JSON:', trimmed);
    return null;
  }

  private getDefaultResult(): AwareResult {
    return {
      reflection: 'No plan',
      step: this.agentContext.currentStep || 1,
      status: 'in-progress',
      plan: [],
    };
  }

  public async run(): Promise<AwareResult> {
    console.log('[Aware] ▶︎ run start, aborted=', this.signal.aborted);
    if (this.signal.aborted) return this.getDefaultResult();

    // 1) 環境情報を取得
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    // 2) モデル・ツール
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';
    const available = (await listTools()) || [];
    const toolList = available
      .map((t) => `${t.name}: ${t.description}`)
      .join(', ');

    // 3) LLMへ投げるメッセージ
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

    // 4) Parse
    const parsed = Aware.safeParse<AwareResult>(content);
    if (!parsed) {
      // フォールバック：回答自体は content に入っていることが多いので、それを1タスクとして返す
      return {
        reflection: '',
        step: 1,
        status: 'completed',
        plan: [
          {
            id: '1',
            title: content.slice(0, 80) || 'Generated answer', // 長すぎる場合は切る
          },
        ],
      };
    }

    // 5) 正常時の整形
    const resultPlan: PlanTask[] = [];
    let step = parsed.step || 1;
    let status = (parsed.status || '').toLowerCase();

    if (
      [
        'pending',
        'executing',
        'running',
        'in progress',
        'in-progress',
      ].includes(status) === false
    ) {
      // 想定外は in-progress へ
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

    // 最終ステップなら completed に補正
    if (resultPlan.length > 0 && step >= resultPlan.length) {
      status = 'completed';
    }

    return {
      reflection: parsed.reflection || '',
      step,
      status,
      plan: resultPlan,
    };
  }
}
