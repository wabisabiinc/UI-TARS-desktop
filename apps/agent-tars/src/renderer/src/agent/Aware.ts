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

  /** Markdownフェンスやテキスト装飾を剥がし、純粋なJSONを抽出 */
  private static safeParse<T>(text: string): T | null {
    const trimmed = text.trim();

    // 1) 丸ごとパースを試み
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // フェンスやインラインを探す
    }

    // 2) ```json ... ```, ``` ... ```, { ... }をキャプチャ
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

    // 3) エスケープ解除
    let cleaned = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();

    // 4) トレーリングカンマを除去（JSON仕様に合うように）
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    // 5) 再パース
    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      console.warn('[Aware.safeParse] parse失敗:', cleaned, e);
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
    if (this.signal.aborted) {
      return this.getDefaultResult();
    }
    // ...（後略: 既存のaskLLMToolロジックは変更不要）...
  }
}
