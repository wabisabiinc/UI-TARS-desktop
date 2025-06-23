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
  ) {}

  private systemPrompt = `You are a tool use expert. ...省略（ここは現状と同じ）... `;

  public updateSignal(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  async run(status: string) {
    // --- 強制デバッグログ ---
    try {
      window?.console?.log?.('[Executor] run() called', status);
    } catch {}
    console.log('[Executor] run() called', status);

    const environmentInfo = await this.agentContext.getEnvironmentInfo(
      this.appContext,
      this.agentContext,
    );

    if (this.abortSignal.aborted) {
      console.log('[Executor] run aborted (pre)');
      return [];
    }

    const streamId = Math.random().toString(36).substring(7);

    return new Promise<ToolCall[]>(async (resolve, reject) => {
      const abortHandler = () => {
        ipcClient.abortRequest({ requestId: streamId });
        resolve([]);
      };

      const activeMcpSettings = await ipcClient
        .getActiveMcpSettings()
        .catch((e) => {
          console.error('Error getting active MCP settings', e);
          return {};
        });

      try {
        this.abortSignal.addEventListener('abort', abortHandler);

        const payload = {
          messages: [
            Message.systemMessage(this.systemPrompt),
            Message.userMessage(environmentInfo),
            Message.userMessage(`Aware status: ${status}`),
          ],
          tools: [idleTool, chatMessageTool],
          mcpServerKeys: [
            ...Object.values(MCPServerName),
            ...Object.keys(activeMcpSettings),
          ],
          requestId: streamId,
        };

        try {
          window?.console?.log?.(
            '[Executor] askLLMTool payload:',
            JSON.stringify(payload, null, 2),
          );
        } catch {}
        console.log(
          '[Executor] askLLMTool payload:',
          JSON.stringify(payload, null, 2),
        );

        const result = await ipcClient.askLLMTool(payload);

        try {
          window?.console?.log?.(
            '[Executor] askLLMTool result:',
            JSON.stringify(result, null, 2),
          );
        } catch {}
        console.log(
          '[Executor] askLLMTool result:',
          JSON.stringify(result, null, 2),
        );

        const toolCalls = (result.tool_calls || []).filter(Boolean);
        try {
          window?.console?.log?.(
            '[Executor] LLM tool_calls:',
            JSON.stringify(toolCalls, null, 2),
          );
        } catch {}
        console.log(
          '[Executor] LLM tool_calls:',
          JSON.stringify(toolCalls, null, 2),
        );

        const interceptedToolCalls = await interceptToolCalls(toolCalls);
        try {
          window?.console?.log?.(
            '[Executor] Intercepted tool_calls:',
            JSON.stringify(interceptedToolCalls, null, 2),
          );
        } catch {}
        console.log(
          '[Executor] Intercepted tool_calls:',
          JSON.stringify(interceptedToolCalls, null, 2),
        );

        resolve(interceptedToolCalls);
      } catch (error) {
        console.error('[Executor] run error:', error);
        reject(error);
      } finally {
        this.abortSignal.removeEventListener('abort', abortHandler);
      }
    });
  }

  async executeTools(toolCalls: ToolCall[]) {
    if (this.abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

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

          try {
            window?.console?.log?.('Execute result', JSON.stringify(result));
          } catch {}
          console.log('Execute result', JSON.stringify(result));
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
