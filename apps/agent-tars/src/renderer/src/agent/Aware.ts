// apps/agent-tars/src/renderer/src/agent/Aware.ts
import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
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
  /**
   * Default prompt for OpenAI mode (uses function calls).
   */
  private readonly getDefaultPrompt = (): string =>
    'You are an AI agent responsible for analyzing the current environment and planning the next actionable step. ' +
    'Use the \"aware_analysis\" tool and return only a function call with a JSON object containing: ' +
    'reflection (string), step (number), status (string), and plan (array of {id: string, title: string}).';

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

    // Gather environment context
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext
    );
    console.log('[Aware] envInfo=', envInfo);

    // Abort handler placeholder
    this.abortSignal.addEventListener('abort', () => {});

    // Determine mode and model
    const useGemini = import.meta.env.VITE_LLM_USE_GEMINI === 'true';
    const model = useGemini
      ? import.meta.env.VITE_LLM_MODEL_GEMINI || 'gemini-2.0-flash'
      : import.meta.env.VITE_LLM_MODEL_GPT    || 'gpt-3.5-turbo';

    // Build prompt
    const systemPrompt = useGemini
      ? 'You are an AI agent responsible for analyzing the current environment and planning the next actionable step. ' +
        'Return only a JSON object with keys: reflection (string), step (number), status (string), plan (array of {id:string,title:string}).'
      : this.getDefaultPrompt();

    // Fetch available tools
    const available = (await listTools()) || [];
    const toolList = available.map(t => `${t.name}: ${t.description}`).join(', ');

    const opts: any = {
      model,
      messages: [
        Message.systemMessage(systemPrompt),
        Message.systemMessage(`Available tools: ${toolList}`),
        Message.userMessage(envInfo),
        Message.userMessage('Please call aware_analysis to decide the next step.'),
      ],
    };
    if (!useGemini) {
      opts.requestId = `aware_${Date.now()}`;
      opts.functions = [
        {
          name: 'aware_analysis',
          description: 'Analyze environment and propose next task',
          parameters: this.awareSchema,
        },
      ];
    }

    console.log('[Aware] → askLLMTool opts=', opts);
    const raw = await askLLMTool(opts);
    const result = raw ?? { tool_calls: [], content: '' };
    console.log('[Aware] ← askLLMTool result=', result);

    // Parse result
    const calls = result.tool_calls ?? [];
    if (calls.length === 0) {
      if (useGemini) {
        // JSON-only response from Gemini
        const parsed = Aware.safeParse<AwareResult>(result.content || '');
        if (parsed) {
          return parsed;
        }
        console.error('Gemini JSON parse failed:', result.content);
      }
      console.warn('No tool calls returned');
      return this.getDefaultResult();
    }

    // Handle function call result
    const firstCall = calls[0];
    const argsText = (firstCall as any).arguments;
    const parsed = Aware.safeParse<AwareResult>(argsText);
    if (!parsed) {
      console.error('Failed to parse tool arguments:', argsText);
      return this.getDefaultResult();
    }

    return parsed;
  }
}
