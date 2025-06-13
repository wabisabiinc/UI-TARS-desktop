// apps/agent-tars/src/renderer/src/agent/Aware.ts

import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
import { ipcClient } from '../api';             // ← 相対パスに修正
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
  /** system プロンプトを返す関数に変更 */
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

  /** Update the abort signal (e.g., on user interrupt) */
  public updateSignal(signal: AbortSignal) {
    this.abortSignal = signal;
  }

  /** Safely parse JSON, returning null on failure */
  private static safeParse<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      console.warn('JSON.parse failed:', text);
      return null;
    }
  }

  /** Default result when no plan or on abort */
  private getDefaultResult(): AwareResult {
    return {
      reflection: 'No plan',
      step: this.agentContext.currentStep,
      status: 'No plan',
      plan: [],
    };
  }

  /** Main execution: request LLM analysis and parse the function call */
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
      abortHandler = () => ipcClient.abortRequest({ requestId });
      this.abortSignal.addEventListener('abort', abortHandler);

      const available = await ipcClient.listTools();
      const toolList = available?.map((t) => `${t.name}: ${t.description}`).join(', ');

      const opts = {
        requestId,
        model:
          import.meta.env.VITE_LLM_USE_GEMINI === 'true'
            ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
            : import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-3.5-turbo',
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
      const raw = await ipcClient.askLLMTool(opts);
      const result = raw ?? { tool_calls: [], content: '' };
      console.log('[Aware] ← askLLMTool result=', result);

      const calls = result.tool_calls ?? [];
      if (calls.length === 0) {
        console.warn('No tool calls returned');
        const rawContent = result.content ?? '';
        try {
          const repaired = jsonrepair(rawContent);
          const fallback = Aware.safeParse<AwareResult>(repaired);
          if (fallback) return fallback;
          console.error('Fallback parse failed:', rawContent);
        } catch (e) {
          console.error('jsonrepair or parse error:', e, rawContent);
        }
        return this.getDefaultResult();
      }

      const firstCall = calls.find((c) => c?.function?.arguments);
      if (!firstCall) {
        console.error('Tool call with arguments not found', calls);
        return this.getDefaultResult();
      }

      const argsText = firstCall.function.arguments;
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
      if (abortHandler) {
        this.abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
