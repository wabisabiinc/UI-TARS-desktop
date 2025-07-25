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
  summary?: string; // 新規: 最終サマリーも受け取り可
}

export class Aware {
  private signal: AbortSignal;

  // “直前のstep・実行内容・履歴も考慮しつつリプラン”できるAIエージェント仕様プロンプト
  private readonly prompt = `
You are an advanced autonomous AI agent for business & research workflows.
At every invocation, analyze the environment, conversation history, your previous reflections and results,
then dynamically REPLAN the optimal next step(s) and full plan if necessary.
- If a tool result or execution log is provided, incorporate it in your reasoning.
- Your goal is to maximize the quality, depth, and usefulness of your output, balancing step granularity and speed.
- Return STRICTLY a valid JSON (NO markdown, no extra text). Output must include:
  • reflection: String, concise self-critique/analysis of the situation (not just a summary)
  • step: Number, current step index (1-based)
  • status: "in-progress" (default) or "completed" (if last step or request fulfilled)
  • plan: Array of {id: string, title: string} -- break down the task into clear multi-step plan, as granular as needed
  • summary: (optional) String, if completed: provide a dense final summary, with actionable points and reference info if possible
`.trim();

  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    abortSignal: AbortSignal,
  ) {
    this.signal = abortSignal;
  }

  /** Update the abort signal if interrupted */
  updateSignal(signal: AbortSignal) {
    this.signal = signal;
  }

  /** Try to recover valid JSON from LLM output */
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

    // 1) Direct parse
    let parsed = tryParse(trimmed);
    if (parsed) return parsed;

    // 2) Code fences
    const fenceJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const fenceAny = fenceJson || trimmed.match(/```([\s\S]*?)```/i);
    if (fenceAny) {
      parsed = tryParse(fenceAny[1]);
      if (parsed) return parsed;
    }

    // 3) Extract JSON object by braces
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

  /** Default result if aborted or parse fails */
  private getDefaultResult(): AwareResult {
    return {
      reflection: '',
      step: this.agentContext.currentStep || 1,
      status: 'in-progress',
      plan: [],
    };
  }

  public async run(): Promise<AwareResult> {
    console.log('[Aware] ▶︎ run start, aborted=', this.signal.aborted);
    if (this.signal.aborted) return this.getDefaultResult();

    // 1) Gather environment info (履歴・実行結果など全て含む)
    const envInfo = this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    // 2) Use fastest available model
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o';
    const available = (await listTools()) || [];
    const toolList =
      available.length > 0
        ? available.map((t) => `${t.name}: ${t.description}`).join(', ')
        : 'none';

    // 3) Build messages
    const messages = [
      Message.systemMessage(this.prompt),
      Message.systemMessage(`Available tools: ${toolList}`),
      Message.userMessage(envInfo),
      Message.userMessage(
        'Analyze the environment, previous results, and plan the next step as high-performing AI agent.',
      ),
    ];
    console.log('[Aware] → askLLMTool', { model });

    const raw = await askLLMTool({
      model,
      messages: messages.map((m) => ({
        role: m.role as any,
        content: m.content,
      })),
      temperature: 0.2, // 低めで安定
      max_tokens: 1500,
    });

    const content = raw?.content?.trim() || '';
    console.log('[Aware] ← askLLMTool content =', content);

    // 4) Try to parse JSON
    const parsed = Aware.safeParse<AwareResult>(content);
    if (!parsed) {
      // Fallback: return the LLM text as a single completed plan step
      return {
        reflection: '',
        step: 1,
        status: 'completed',
        plan: [
          {
            id: '1',
            title: content.slice(0, 80) || 'Generated answer',
          },
        ],
      };
    }

    // 5) Normalize result
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

    // If final step, mark completed
    if (resultPlan.length > 0 && step >= resultPlan.length) {
      status = 'completed';
    }

    return {
      reflection: parsed.reflection || '',
      step,
      status,
      plan: resultPlan,
      summary: parsed.summary,
    };
  }
}
