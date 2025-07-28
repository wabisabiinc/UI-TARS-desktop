// apps/agent-tars/src/renderer/src/agent/Aware.ts

import { Message } from '@agent-infra/shared';
import { AgentContext } from './AgentFlow';
import {
  askLLMTool,
  ipcClient,
  ensureIpcReady,
  onMainStreamEvent,
} from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { PlanTask } from '@renderer/type/agent';
import { MessageType } from '@vendor/chat-ui';
import { globalEventEmitter } from '@renderer/state/chat';

export interface AwareResult {
  reflection: string;
  step: number;
  status: 'in-progress' | 'completed' | 'failed';
  plan: PlanTask[];
}

export class Aware {
  constructor(
    private appContext: AppContext,
    private agentContext: AgentContext,
    private abortSignal: AbortSignal,
  ) {}

  public async run(): Promise<AwareResult> {
    const input = this.appContext.request.inputText;

    const systemPrompt = `
You are a high-level planning AI assistant. Your job:
- Analyze the user input.
- Break down the task into a step-by-step plan.
- Reflect why this plan is reasonable.
- Format the result in the structure: { reflection, step, status, plan }

Answer in JSON only.
`.trim();

    const userPrompt = `
Analyze the following user request and create a step-by-step plan.

【User Request】
${input}
`.trim();

    // 非Electron環境向け fallback
    if (!this.agentContext.useStream) {
      const result = await askLLMTool({
        model: import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o',
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(userPrompt),
        ],
      });

      const parsed = this.parseAwareResult(result?.content ?? '');
      return parsed;
    }

    // Electron: ストリーム
    await ensureIpcReady();
    let raw = '';

    const streamId = await ipcClient.askLLMTextStream({
      messages: [
        Message.systemMessage(systemPrompt),
        Message.userMessage(userPrompt),
      ],
      requestId: Math.random().toString(36).substring(2),
    });

    await this.appContext.chatUtils.addMessage(
      { type: MessageType.PlainText, content: '' },
      { shouldSyncStorage: true, shouldScrollToBottom: true },
    );

    return new Promise<AwareResult>((resolve, reject) => {
      if (this.abortSignal.aborted) {
        ipcClient.abortRequest({ requestId: streamId });
        return resolve({
          reflection: '',
          status: 'failed',
          step: 0,
          plan: [],
        });
      }

      let aborted = false;
      let updateTimer: NodeJS.Timeout | null = null;

      const onTerm = (e: any) => {
        if (e.type === 'terminate') {
          ipcClient.abortRequest({ requestId: streamId });
          aborted = true;
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
        }
      };
      globalEventEmitter.addListener(this.appContext.agentFlowId, onTerm);

      const cleanup = onMainStreamEvent(streamId, {
        onData: async (chunk: string) => {
          if (aborted) return;
          raw += chunk;

          if (updateTimer) clearTimeout(updateTimer);
          updateTimer = setTimeout(async () => {
            await this.appContext.chatUtils.updateMessage(
              { type: MessageType.PlainText, content: raw },
              { shouldSyncStorage: true },
            );
          }, 100);
        },
        onError: (err) => {
          reject(err);
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
          cleanup();
        },
        onEnd: () => {
          if (updateTimer) clearTimeout(updateTimer);
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);

          try {
            const parsed = this.parseAwareResult(raw);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }

          cleanup();
        },
      });
    });
  }

  private parseAwareResult(jsonStr: string): AwareResult {
    try {
      const obj = JSON.parse(jsonStr.trim());

      // 構造補正：planが配列かどうか確認
      const plan: PlanTask[] = Array.isArray(obj.plan)
        ? obj.plan.map((p: any, i: number) => ({
            id: p.id ?? `${i + 1}`,
            title: p.step ?? p.title ?? `Step ${i + 1}`,
            status: (p.status as PlanTask['status']) ?? 'Todo',
          }))
        : [];

      const step =
        typeof obj.step === 'number'
          ? obj.step
          : Array.isArray(obj.step)
            ? obj.step.length
            : 1;

      return {
        reflection: obj.reflection ?? '',
        step,
        status: obj.status ?? 'failed',
        plan,
      };
    } catch (err) {
      console.warn('[Aware] Failed to parse result:', jsonStr);
      return {
        reflection: '',
        status: 'failed',
        step: 0,
        plan: [],
      };
    }
  }
}
