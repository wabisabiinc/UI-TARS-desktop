import { AppContext } from '@renderer/hooks/useAgentFlow';
import { AgentContext } from '../AgentFlow';
import { ipcClient } from '@renderer/api';
import { MCPServerName, Message, ToolCall } from '@agent-infra/shared';
import { chatMessageTool, idleTool } from './tools';
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { interceptToolCalls } from '@renderer/api/fileSystemInterceptor';

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

  private systemPrompt = `You are a tool use expert. ... 省略 ...`;

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  // === ここを強制ダミーToolCall返却に書き換え ===
  async run(status: string) {
    console.log('[DEBUG] Executor.run called with status:', status);

    // 強制的に必ずダミーToolCallを返す！（ここが超重要テスト）
    return [
      {
        function: {
          name: 'chatMessage',
          arguments: JSON.stringify({
            text: '【テスト】ダミーtoolcallによるメッセージ',
          }),
        },
        id: 'dummy-toolcall-1',
      },
    ];
  }
  // ============================================

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

    // それ以外は本来の実装にfall back（通常ここまで到達しない想定）
    return new Promise<z.infer<typeof CompatibilityCallToolResultSchema>[]>(
      async (resolve, reject) => {
        const abortHandler = () => {
          reject(new DOMException('Aborted', 'AbortError'));
        };
        try {
          this.abortSignal.addEventListener('abort', abortHandler);
          const interceptedToolCalls = await interceptToolCalls(toolCalls);
          const result = await ipcClient.executeTool({
            toolCalls: interceptedToolCalls,
          });
          if (this.abortSignal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.abortSignal.removeEventListener('abort', abortHandler);
        }
      },
    );
  }
}
