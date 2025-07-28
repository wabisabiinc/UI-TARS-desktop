import { MessageType } from '@vendor/chat-ui';
import { Message } from '@agent-infra/shared';
import {
  askLLMTool,
  ipcClient,
  onMainStreamEvent,
  ensureIpcReady,
  isElectron,
} from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { globalEventEmitter } from '@renderer/state/chat';

export class Greeter {
  constructor(
    private appContext: AppContext,
    private abortSignal: AbortSignal,
  ) {}

  private async fallbackGreet(
    systemPrompt: string,
    userInput: string,
  ): Promise<string> {
    const res = await askLLMTool({
      model: import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
    });
    return (res?.content ?? '').trim();
  }

  public async run(): Promise<string> {
    const inputText = this.appContext.request.inputText;
    const systemPrompt = `
You are a highly skilled, empathetic AI assistant specialized in initiating engaging and friendly conversations. Your objectives:
- Greet the user warmly and professionally in Japanese if the user writes Japanese.
- Keep the greeting concise (under 2 sentences) and avoid technical jargon or markdown.
- Use one small, appropriate emoji, but do not overuse.
- Reflect the user’s query context in your greeting.
- Plain text only.
`.trim();

    if (!isElectron) {
      const text = await this.fallbackGreet(systemPrompt, inputText);
      await this.appContext.chatUtils.addMessage(
        { type: MessageType.PlainText, content: text },
        { shouldSyncStorage: true, shouldScrollToBottom: true },
      );
      return text;
    }

    await ensureIpcReady();
    let greetMessage = '';
    const streamId = await ipcClient.askLLMTextStream({
      messages: [
        Message.systemMessage(systemPrompt),
        Message.userMessage(inputText),
      ],
      requestId: Math.random().toString(36).substring(2),
    });

    await new Promise((r) => setTimeout(r, 120));

    return new Promise<string>((resolve, reject) => {
      if (this.abortSignal.aborted) {
        ipcClient.abortRequest({ requestId: streamId });
        return resolve('');
      }

      let aborted = false;
      let updateTimer: NodeJS.Timeout | null = null;

      const onTerm = (e: any) => {
        if (e.type === 'terminate') {
          ipcClient.abortRequest({ requestId: streamId });
          aborted = true;
          resolve(greetMessage);
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
        }
      };
      globalEventEmitter.addListener(this.appContext.agentFlowId, onTerm);

      const cleanup = onMainStreamEvent(streamId, {
        onData: async (chunk: string) => {
          if (aborted) return;
          greetMessage += chunk;

          if (updateTimer) clearTimeout(updateTimer);
          updateTimer = setTimeout(async () => {
            await this.appContext.chatUtils.updateMessage(
              { type: MessageType.PlainText, content: greetMessage },
              { shouldSyncStorage: true },
            );
          }, 100); // ⏱ 遅延バッファリング（ここが高速化のポイント）
        },
        onError: (err) => {
          reject(err);
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
          cleanup();
        },
        onEnd: () => {
          if (updateTimer) clearTimeout(updateTimer);
          resolve(greetMessage);
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
          cleanup();
        },
      });
    });
  }

  public async generateFinalSummary(): Promise<string> {
    const planSummary =
      this.appContext.agentContext?.plan
        ?.map((p, i) => `【${i + 1}】${p.title}`)
        .join('\n') ?? '';

    const systemPrompt = `
You are a world-class professional AI summarizer. Your task:
- Read the user’s original request and the detailed plan steps completed so far.
- Produce a final summary in Japanese, concise (<= 5000 chars), clear, and actionable.
- Highlight key takeaways and next actions in numbered or bullet format.
- Plain text only.

【ユーザーのリクエスト】
${this.appContext.request.inputText}

【プラン進捗】
${planSummary}
`.trim();

    const raw = await askLLMTool({
      model: import.meta.env.VITE_LLM_MODEL_GPT || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'これまでの内容をまとめてください。' },
      ],
    });

    if (raw && typeof raw.content === 'string') {
      return raw.content.trim();
    }
    console.warn('[Greeter] Unexpected summary response:', raw);
    return (raw?.content ?? '').toString().trim();
  }
}
