// apps/agent-tars/src/renderer/src/agent/Executor/index.ts
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { AgentContext } from '../AgentFlow';
import { ipcClient, isElectron, analyzeImageWeb } from '@renderer/api';
import { ToolCall } from '@agent-infra/shared';
import { ExecutorToolType } from './tools';

// Utility: convert File to Base64 (browser only)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [, base64] = dataUrl.split(',');
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate ToolCalls, handling image attachments in both Electron and Web
async function createToolCalls(
  agentContext: AgentContext,
  status: string,
  inputFiles?: any[],
): Promise<ToolCall[]> {
  const plan = agentContext.plan;
  const currentStep = agentContext.currentStep;

  // If images are provided, analyze them
  if (inputFiles && inputFiles.length > 0) {
    return Promise.all(
      inputFiles.map(async (f: any, idx: number) => {
        if (isElectron) {
          // Electron: send file path
          return {
            function: {
              name: ExecutorToolType.AnalyzeImage,
              arguments: JSON.stringify({ path: f.path }),
            },
            id: `toolcall-analyzeImage-${Date.now()}-${idx}`,
          };
        } else {
          // Web: convert File to base64 and send
          const base64 = await fileToBase64(f as File);
          return {
            function: {
              name: ExecutorToolType.AnalyzeImage,
              arguments: JSON.stringify({ imageBase64: base64 }),
            },
            id: `toolcall-analyzeImage-${Date.now()}-${idx}`,
          };
        }
      }),
    );
  }

  // If all tasks are done, idle
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

  // Otherwise send chatMessage tool
  const currentTask = agentContext.plan[agentContext.currentStep - 1];
  if (currentTask?.title) {
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

  /** Decide which tool calls to make based on status + input files */
  public async run(status: string, inputFiles?: any[]): Promise<ToolCall[]> {
    console.log('[DEBUG] Executor.run called with status:', status);
    // Always generate tool calls (image or chat), even in Web
    return createToolCalls(this.agentContext, status, inputFiles);
  }

  /** Execute the given tool calls */
  public async executeTools(toolCalls: ToolCall[]) {
    if (this.abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];

    const first = toolCalls[0];
    const fnName = first.function?.name;

    if (fnName === ExecutorToolType.AnalyzeImage) {
      const args = JSON.parse(first.function.arguments || '{}');
      try {
        if (isElectron && ipcClient?.tools?.analyzeImage) {
          // Electron IPC
          const result = await ipcClient.tools.analyzeImage(args.path);
          return [{ content: { text: result }, isError: false }];
        } else {
          // Web: call analyzeImageWeb
          const result = await analyzeImageWeb(args.imageBase64);
          return [{ content: { text: result }, isError: false }];
        }
      } catch (e: any) {
        console.error('[Executor] analyzeImage error', e);
        return [
          {
            content: {
              text: `analyzeImage failed: ${e.message ?? String(e)}`,
            },
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

    // Additional tools can be handled here
    return [];
  }
}
