import { MessageType } from '@vendor/chat-ui';
import { Message } from '@agent-infra/shared';
import { askLLMTool, ipcClient, onMainStreamEvent } from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { globalEventEmitter } from '@renderer/state/chat';

export class Greeter {
  constructor(
    private appContext: AppContext,
    private abortSignal: AbortSignal,
  ) {}

  /** 起動時のあいさつをストリーミングで返す */
  async run(): Promise<string> {
    try {
      let greetMessage = '';
      const inputText = this.appContext.request.inputText;

      const systemPrompt = `
You are a highly skilled, empathetic AI assistant specialized in initiating engaging and friendly conversations. Your objectives:
- Greet the user warmly and professionally, demonstrating genuine empathy and readiness to help.
- Keep the greeting concise (under 2 sentences) and avoid technical jargon or markdown.
- Use a small, appropriate emoji to enhance friendliness, but do not overuse.
- Reflect the user’s query context in your greeting (e.g., "I see you want to …").
- Maintain a positive, enthusiastic tone without fluff.
- Do NOT include headings, lists, or special formatting—just plain text.
`;
      const streamId = await ipcClient.askLLMTextStream({
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(inputText),
        ],
        requestId: Math.random().toString(36).substring(2),
      });

      // 初期バブル用の空メッセージ
      await new Promise((resolve) => setTimeout(resolve, 200));

      return new Promise<string>((resolve, reject) => {
        if (this.abortSignal.aborted) {
          ipcClient.abortRequest({ requestId: streamId });
          resolve('');
          return;
        }
        let aborted = false;
        const onTerm = (event: any) => {
          if (event.type === 'terminate') {
            ipcClient.abortRequest({ requestId: streamId });
            aborted = true;
            resolve(greetMessage);
            globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
          }
        };
        globalEventEmitter.addListener(this.appContext.agentFlowId, onTerm);

        const cleanupStream = onMainStreamEvent(streamId, {
          onData: async (chunk: string) => {
            if (aborted) return;
            greetMessage += chunk;
            await this.appContext.chatUtils.updateMessage(
              { type: MessageType.PlainText, content: greetMessage },
              { shouldSyncStorage: true },
            );
          },
          onError: (err) => {
            reject(err);
            globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
            cleanupStream();
          },
          onEnd: () => {
            resolve(greetMessage);
            globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
            cleanupStream();
          },
        });
      });
    } catch (e) {
      console.error('[Greeter] run error:', e);
      throw e;
    }
  }

  /** 全ステップ完了後の最終まとめをプレーンテキストで取得 */
  public async generateFinalSummary(): Promise<string> {
    const planSummary =
      this.appContext.agentContext?.plan
        ?.map((p, i) => `【${i + 1}】${p.title}`)
        .join('\n') ?? '';

    const systemPrompt = `
You are a world-class professional AI summarizer. Your task:
- Read the user’s original request and the detailed plan steps completed so far.
- Produce a final summary in Japanese, concise (max 5000 characters), clear, and    actionable.
- Highlight key takeaways and next recommended actions in a numbered or bullet format.
- Write only plain text—no markdown, JSON, or special formatting.
- Use polite, professional language suitable for business contexts.

【ユーザーのリクエスト】
${this.appContext.request.inputText}

【プラン進捗】
${planSummary}
`;
    const raw = await askLLMTool({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'これまでの内容をまとめてください。' },
      ],
    });

    if (raw && typeof raw.content === 'string') {
      return raw.content.trim();
    }
    console.warn('[Greeter] Unexpected summary response:', raw);
    return String(raw ?? '').trim();
  }
}
