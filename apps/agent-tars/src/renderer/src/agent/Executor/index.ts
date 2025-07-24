import { AppContext } from '@renderer/hooks/useAgentFlow';
import { AgentContext } from '../AgentFlow';
import { ipcClient, isElectron } from '@renderer/api';
import { ToolCall } from '@agent-infra/shared';
import { chatMessageTool, idleTool } from './tools';
import { ExecutorToolType } from './tools';

// Utility: 現在のStepのPlanTaskを取得
function getCurrentPlanTask(agentContext: AgentContext) {
  return agentContext.plan[agentContext.currentStep - 1];
}

// Utility: toolcall生成（画像添付に対応）
function createToolCalls(
  agentContext: AgentContext,
  status: string,
  inputFiles?: any[],
): ToolCall[] {
  const plan = agentContext.plan;
  const currentStep = agentContext.currentStep;
  const currentTask = getCurrentPlanTask(agentContext);

  if (inputFiles && inputFiles.length > 0) {
    return inputFiles.map((f, idx) => ({
      function: {
        name: ExecutorToolType.AnalyzeImage,
        arguments: JSON.stringify({ path: f.path }),
      },
      id: `toolcall-analyzeImage-${Date.now()}-${idx}`,
    }));
  }

  if (plan.length > 0 && plan.every((t) => t.status === 'Done')) {
    return [
      {
        function: {
          name: ExecutorToolType.Idle,
          arguments: JSON.stringify({}),
        },
        id: `toolcall-idle-${Date.now()}`,
      },
    ];
  }

  if (currentTask && currentTask.title) {
    return [
      {
        function: {
          name: ExecutorToolType.ChatMessage,
          arguments: JSON.stringify({
            text: `Step_${currentStep}: ${currentTask.title}`,
            attachments: [],
          }),
        },
        id: `toolcall-chatmsg-${Date.now()}`,
      },
    ];
  }

  return [];
}

export class Executor {
  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal,
  ) {
    console.log('[DEBUG] Executor constructor called!', {
      appContext,
      agentContext,
    });
  }

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  async run(status: string, inputFiles?: any[]) {
    console.log('[DEBUG] Executor.run called with status:', status);
    if (!isElectron) {
      console.log('[Executor] skip tool calls (web mode)');
      return [];
    }
    return createToolCalls(this.agentContext, status, inputFiles);
  }

  async executeTools(toolCalls: ToolCall[]) {
    if (this.abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];

    const first = toolCalls[0];
    const fnName = first.function?.name;

    if (fnName === ExecutorToolType.AnalyzeImage) {
      if (!isElectron || !ipcClient?.tools?.analyzeImage) {
        console.warn(
          '[Executor] analyzeImage tool is not available (web mode)',
        );
        return [
          {
            content: {
              text: '画像解析ツールはこの環境では使用できません。',
            },
            isError: false,
          } as any,
        ];
      }
      try {
        const args = JSON.parse(first.function.arguments || '{}');
        const result = await ipcClient.tools.analyzeImage({ path: args.path });
        return [
          {
            content: { text: result },
            isError: false,
          },
        ];
      } catch (e) {
        console.error('[Executor] analyzeImage error', e);
        return [
          {
            content: { text: `analyzeImage failed: ${String(e)}` },
            isError: true,
          },
        ];
      }
    }

    if (fnName === ExecutorToolType.ChatMessage) {
      return [
        {
          content: { text: '【ダミーToolCall実行成功】' },
          isError: false,
        } as any,
      ];
    }

    // 他ツールはここに追加
    return [];
  }
}
