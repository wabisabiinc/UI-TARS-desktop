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

  private systemPrompt = `You are a tool use expert. You can only respond with a valid ToolCall JSON structure.`;

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  // ======== 強制ダミーToolCall返却（テスト用） =========
  async run(status: string) {
    console.log('[DEBUG] Executor.run called with status:', status);

    // 強制ダミーtoolcall返却
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
    ] as ToolCall[];
  }
  // ===============================================

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
