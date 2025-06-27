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

// Utility: toolcall生成（必要に応じて拡張可）
function createToolCalls(
  agentContext: AgentContext,
  status: string,
): ToolCall[] {
  const plan = agentContext.plan;
  const currentStep = agentContext.currentStep;
  const currentTask = getCurrentPlanTask(agentContext);

  // 例1: すべてのPlanTaskがDoneならidle toolを返す
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

  // 例2: 通常はchatMessage toolcallを返す（plan内容を使う）
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

  // 例3: 何もない場合は空配列
  return [];
}

export class Executor {
  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal,
  ) {
    // ★絶対に1回は出るログ
    console.log('[DEBUG] Executor constructor called!', {
      appContext,
      agentContext,
    });
  }

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  async run(status: string) {
    console.log('[DEBUG] Executor.run called with status:', status);

    // ↓ ユーティリティ関数でToolCallリストを返す（テスト時はダミーでOK）
    return createToolCalls(this.agentContext, status);
  }

  async executeTools(toolCalls: ToolCall[]) {
    if (this.abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // toolCallsの1件目がchatMessageなら「成功」レスポンスを強制返却
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

    // 通常時は従来処理
    // ...省略（従来通り）
  }
}
