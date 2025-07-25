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

// ToolCall生成: AIエージェントのプラン内容/入力ファイルを考慮
async function createToolCalls(
  agentContext: AgentContext,
  status: string,
  inputFiles?: any[],
): Promise<ToolCall[]> {
  const plan = agentContext.plan;
  const currentStep = agentContext.currentStep;

  // 画像処理ステップ: 画像があれば即tool
  if (inputFiles && inputFiles.length > 0) {
    return Promise.all(
      inputFiles.map(async (f: any, idx: number) => {
        if (isElectron) {
          // Electron: ファイルパス
          return {
            function: {
              name: ExecutorToolType.AnalyzeImage,
              arguments: JSON.stringify({ path: f.path }),
            },
            id: `toolcall-analyzeImage-${Date.now()}-${idx}`,
          };
        } else {
          // Web: base64変換
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

  // 全step完了ならIdle tool
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

  // 現在のstepに合わせてChatMessageツールを生成
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
    // DEBUG
  }

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  /** Decide which tool calls to make based on status + input files */
  public async run(status: string, inputFiles?: any[]): Promise<ToolCall[]> {
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
      // 現在はダミー。実際にはAIチャット出力や外部サービス連携可能
      return [
        {
          content: { text: '【ToolCall実行】' },
          isError: false,
        } as any,
      ];
    }

    // 追加tool分岐もここで
    return [];
  }
}
