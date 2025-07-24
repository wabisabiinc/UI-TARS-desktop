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
IGNORE ANY PREVIOUS PLAN OR STEPS UNLESS THE USER EXPLICITLY SAYS "CONTINUE".
OUTPUT MUST BE STRICT JSON ONLY. DO NOT WRAP IN ANY TEXT.
You are an AI agent responsible for analyzing the current environment and planning the next actionable step.
Return only a raw JSON object with the following keys:
  • reflection (string)
  • step (number)
  • status (string)  ← "in-progress" normally, "completed" when step == plan.length
  • plan (array of { id: string, title: string })
Do NOT include markdown fences.
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

  private static safeParse<T>(text: string): T | null {
    const tryParse = (s: string): T | null => {
      try {
        return JSON.parse(s) as T;
      } catch {
        return null;
      }
    };

    const trimmed = text?.trim() ?? '';
    if (!trimmed) return null;

    let parsed = tryParse(trimmed);
    if (parsed) return parsed;

    const fenceJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const fenceAny = fenceJson || trimmed.match(/```([\s\S]*?)```/i);
    if (fenceAny) {
      parsed = tryParse(fenceAny[1]);
      if (parsed) return parsed;
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
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

    // 1) 環境情報
    const envInfo = this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    // 2) モデル・ツール一覧
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';
    const available = (await listTools()) || [];
    const toolList =
      available.length > 0
        ? available.map((t) => `${t.name}: ${t.description}`).join(', ')
        : 'none';

    // 3) プロンプト組み立て
    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Analyze the environment and plan the next step in JSON.',
      ),
    ];
    console.log('[Aware] → askLLMTool', { model });

    const raw = await askLLMTool({
      model,
      messages: messages.map((m) => ({
        role: m.role as any,
        content: m.content,
      })),
    });

    const content = raw?.content?.trim() || '';
    console.log('[Aware] ← askLLMTool content =', content);

    const parsed = Aware.safeParse<AwareResult>(content);
    if (!parsed) {
      return {
        reflection: '',
        step: 1,
        status: 'in-progress',
        plan: [
          {
            id: '1',
            title: content.slice(0, 80) || 'Answer the current user request',
          },
        ],
      };
    }

    // 4) 正常時の整形
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
