import { AppContext } from '@renderer/hooks/useAgentFlow';
import { AgentContext } from '../AgentFlow';
import { ipcClient } from '@renderer/api';
import { MCPServerName, ToolCall } from '@agent-infra/shared';
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
  inputFiles?: any[], // 画像ファイル配列
): ToolCall[] {
  const plan = agentContext.plan;
  const currentStep = agentContext.currentStep;
  const currentTask = getCurrentPlanTask(agentContext);

  // 画像ファイルがある場合 analyzeImage toolcallを返す
  if (inputFiles && inputFiles.length > 0) {
    return [
      {
        function: {
          name: ExecutorToolType.AnalyzeImage, // ツール名
          arguments: JSON.stringify({
            path: inputFiles[0].path, // 1枚目画像のpath
          }),
        },
        id: `toolcall-analyzeImage-${Date.now()}`,
      },
    ];
  }

  // すべてのPlanTaskがDoneならidle tool
  if (plan.length > 0 && plan.every((task) => task.status === 'Done')) {
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

  // 通常はchatMessage toolcall
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

  // 何もない場合は空配列
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

  // ★ inputFilesをrunに渡せる
  async run(status: string, inputFiles?: any[]) {
    console.log('[DEBUG] Executor.run called with status:', status);
    return createToolCalls(this.agentContext, status, inputFiles);
  }

  async executeTools(toolCalls: ToolCall[]) {
    if (this.abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // analyzeImage toolへの分岐
    if (
      toolCalls &&
      toolCalls[0] &&
      toolCalls[0].function?.name === 'analyzeImage'
    ) {
      const args = JSON.parse(toolCalls[0].function.arguments || '{}');
      const result = await ipcClient.tools.analyzeImage(args.path);
      return [
        {
          content: { text: result },
          isError: false,
        },
      ];
    }

    // chatMessage toolのダミー
    if (
      toolCalls &&
      toolCalls[0] &&
      toolCalls[0].function?.name === 'chatMessage'
    ) {
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
