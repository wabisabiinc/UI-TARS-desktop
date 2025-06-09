import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
import { ipcClient } from '@renderer/api';
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
  private readonly systemPrompt = `You are an AI agent responsible for analyzing the current environment and planning the next actionable step. Use the 'aware_analysis' tool and return only a function call with this JSON format:\n````json\n{\n  "reflection": "[Your reflection on the environment]",\n  "step": [nextStepNumber],\n  "status": "[Next action description]",\n  "plan": [\n    {"id": "step_001", "title": "First actionable task"},\n    ...\n  ]\n}`````;

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
            title: { type: 'string' }
          }
        }
      }
    },
    required: ['reflection', 'step', 'status']
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
      plan: []
    };
  }

  /** Main execution: request LLM analysis and parse the tool call */
  public async run(): Promise<AwareResult> {
    // Abort early if signal is already aborted
    if (this.abortSignal.aborted) {
      return this.getDefaultResult();
    }

    // Gather environment context
    const envInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext
    );

    // Unique request ID for abort handling
    const requestId = `aware_${Date.now()}`;
    let abortHandler: () => void;

    try {
      // Register abort event listener
      abortHandler = () => ipcClient.abortRequest({ requestId });
      this.abortSignal.addEventListener('abort', abortHandler);

      // Fetch available tools
      const available = await ipcClient.listTools();
      const toolList = available?.map(t => `${t.name}: ${t.description}`).join(', ');

      // Invoke LLM with function-calling
      const result = await ipcClient.askLLMTool({
        requestId,
        messages: [
          Message.systemMessage(this.systemPrompt),
          Message.systemMessage(`Available tools: ${toolList}`),
          Message.userMessage(envInfo),
          Message.userMessage('Please call aware_analysis to decide the next step.')
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'aware_analysis',
            description: 'Analyze environment and propose next task',
            parameters: this.awareSchema
          }
        }]
      });

      // Guard: no response
      if (!result) {
        console.warn('askLLMTool returned undefined');
        return this.getDefaultResult();
      }

      const calls = result.tool_calls ?? [];

      // Guard: empty tool_calls -> try fallback on result.content
      if (calls.length === 0) {
        console.warn('No tool calls returned');
        const raw = result.content ?? '';
        try {
          const repaired = jsonrepair(raw);
          const fallback = Aware.safeParse<AwareResult>(repaired);
          if (fallback) return fallback;
          console.error('Fallback parse failed:', raw);
        } catch (e) {
          console.error('jsonrepair or parse error:', e, raw);
        }
        return this.getDefaultResult();
      }

      // Find first valid call
      const firstCall = calls.find(c => c?.function?.arguments);
      if (!firstCall) {
        console.error('Tool call with arguments not found', calls);
        return this.getDefaultResult();
      }

      // Parse and return the tool call arguments
      const argsText = firstCall.function.arguments;
      const parsed = Aware.safeParse<AwareResult>(argsText);
      if (!parsed) {
        console.error('Failed to parse tool arguments:', argsText);
        return this.getDefaultResult();
      }

      return parsed;
    } catch (e: any) {
      // Handle abort vs other errors
      if (e.name === 'AbortError') {
        return this.getDefaultResult();
      }
      console.error('Aware.run error:', e);
      return this.getDefaultResult();
    } finally {
      // Clean up listener
      if (abortHandler) this.abortSignal.removeEventListener('abort', abortHandler);
    }
  }
}
