import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
// 直接 fetch／IPC 切り替え版をインポート
import { askLLMTool, listTools } from '../api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { PlanTask } from '@renderer/type/agent';
import { jsonrepair } from 'jsonrepair';

export interface AwareResult {
  reflection: string;
  step: number;
  status: string;
  plan?: PlanTask[];
}

/**
 * Aware: Ambient World Analysis and Response Engine
 * - Analyzes the environment via LLM
 * - Plans next actionable step
 */
export class Aware {
  private readonly getSystemPrompt = (): string => `
You are an AI agent responsible for analyzing the current environment and planning the next actionable step.
Use the 'aware_analysis' tool and return only a function call with this JSON format:
\`\`\`json
{
  "reflection": "[Your reflection on the environment]",
  "step": [nextStepNumber],
  "status": "[Next action description]",
  "plan": [
    {"id": "step_001", "title": "First actionable task"},
    ...
  ]
}
\`\`\`
`;

  private readonly awareSchema = {
    type: 'object',
    properties: {
      reflection: { type: 'string' },
      step: { type: 'number' },
      status: { type: 'string' },
      plan: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'title'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
          },
        },
      },
    },
    required: ['reflection', 'step', 'status'],
  } as const;

  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal
  ) {}

  public updateSignal(signal: AbortSignal) {
    this.abortSignal = signal;
  }

  private static safeParse<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      console.warn('JSON.parse failed:', text);
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
    console.log('[Aware] ▶︎ run() start, aborted=', this.abortSignal.aborted);
    if (this.abortSignal.aborted) {
      return this.getDefaultResult();
    }

    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext
    );
    console.log('[Aware] envInfo=', envInfo);

    const requestId = `aware_${Date.now()}`;
    let abortHandler: () => void;

    try {
      // ユーザー途中中断対応
      abortHandler = () => {
        // askLLMTool には abort 機能がある想定
        // (ブラウザ fetch 版は未対応)
      };
      this.abortSignal.addEventListener('abort', abortHandler);

      // ツール一覧を取得（Electron: IPC / Browser: 空配列）
      const available = await listTools();
      const toolList = available.map((t) => `${t.name}: ${t.description}`).join(', ');

      // 環境変数または設定ストア経由でモデルを決定（既存ロジックをそのまま利用）
      const useGemini = process.env.LLM_USE_GEMINI === 'true';
      const model = useGemini
        ? process.env.LLM_MODEL_GEMINI || 'gemini-2.0-flash'
        : process.env.LLM_MODEL_GPT    || 'gpt-3.5-turbo';

      const opts = {
        requestId,
        model,
        messages: [
          Message.systemMessage(this.getSystemPrompt()),
          Message.systemMessage(`Available tools: ${toolList}`),
          Message.userMessage(envInfo),
          Message.userMessage('Please call aware_analysis to decide the next step.'),
        ],
        functions: [
          {
            name: 'aware_analysis',
            description: 'Analyze environment and propose next task',
            parameters: this.awareSchema,
          },
        ],
      } as const;

      console.log('[Aware] → askLLMTool opts=', opts);
      // fetch 版 or IPC 版を自動切り替え
      const raw = await askLLMTool(opts);
      const result = raw ?? { tool_calls: [], content: '' };
      console.log('[Aware] ← askLLMTool result=', result);

      const calls = result.tool_calls ?? [];
      if (calls.length === 0) {
        console.warn('No tool calls returned');
        const rawContent = result.content ?? '';
        if (rawContent.trim()) {
          try {
            const repaired = jsonrepair(rawContent);
            const fallback = Aware.safeParse<AwareResult>(repaired);
            if (fallback) return fallback;
            console.error('Fallback parse failed:', rawContent);
          } catch (e) {
            console.error('jsonrepair or parse error:', e, rawContent);
          }
        }
        return this.getDefaultResult();
      }

      const firstCall = calls.find((c) => c.arguments);
      if (!firstCall) {
        console.error('Tool call with arguments not found', calls);
        return this.getDefaultResult();
      }

      const argsText = (firstCall as any).arguments;
      const parsed = Aware.safeParse<AwareResult>(argsText);
      if (!parsed) {
        console.error('Failed to parse tool arguments:', argsText);
        return this.getDefaultResult();
      }

      return parsed;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return this.getDefaultResult();
      }
      console.error('Aware.run error:', e);
      return this.getDefaultResult();
    } finally {
      this.abortSignal.removeEventListener('abort', abortHandler!);
    }
  }
}
