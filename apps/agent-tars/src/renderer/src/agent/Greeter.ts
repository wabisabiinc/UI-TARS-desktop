import { v4 as uuid } from 'uuid';
import { MessageType } from '@vendor/chat-ui';
import { Message } from '@agent-infra/shared';
import { ipcClient, onMainStreamEvent } from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { globalEventEmitter } from '@renderer/state/chat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';

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

      const streamId = await ipcClient.askLLMTextStream({
        messages: [
          Message.systemMessage(`
            You are a friendly greeter. Your role is to:
            - Understand and empathize with users first
            - Provide a warm, professional response
            - Add a small amount of emoji to enhance the atmosphere
            - Keep your greeting brief and encouraging
            - Be enthusiastic and positive
            - Let the user know you're ready to help them
            - Returns normal text instead of markdown format or html format
          `),
          Message.userMessage(inputText),
        ],
        requestId: Math.random().toString(36).substring(7),
      });

      // 小さくウェイトを入れてバブル描画用の空メッセージを挿入
      await new Promise((resolve) => setTimeout(resolve, 200));

      return new Promise<string>((resolve, reject) => {
        if (this.abortSignal.aborted) {
          ipcClient.abortRequest({ requestId: streamId });
          resolve('');
          return;
        }

        let aborted = false;
        const cleanupTerminate = () => {
          globalEventEmitter.off(this.appContext.agentFlowId, onTerm);
        };
        const onTerm = (event: any) => {
          if (event.type === 'terminate') {
            ipcClient.abortRequest({ requestId: streamId });
            aborted = true;
            resolve(greetMessage);
            cleanupTerminate();
          }
        };
        globalEventEmitter.addListener(this.appContext.agentFlowId, onTerm);

        const cleanupStream = onMainStreamEvent(streamId, {
          onData: async (chunk: string) => {
            if (aborted) return;
            greetMessage += chunk;
            await this.appContext.chatUtils.updateMessage(
              {
                type: MessageType.PlainText,
                content: greetMessage,
              },
              { shouldSyncStorage: true },
            );
          },
          onError: (err) => {
            reject(err);
            cleanupTerminate();
            cleanupStream();
          },
          onEnd: async () => {
            resolve(greetMessage);
            cleanupTerminate();
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
    // プランと進捗をプレーンテキスト化
    const planSummary =
      this.appContext.agentContext?.plan
        ?.map((p, i) => `【${i + 1}】${p.title}`)
        .join('\n') ?? '';

    // 要約専用プロンプト（通常テキスト出力）
    const systemPrompt = `
あなたはドキュメント要約の専門家です。
以下のユーザーのリクエストとプラン進捗を参考に、最終的な要約を日本語で500字以内で簡潔に返してください。
回答は必ず通常のテキスト形式（JSONやマークダウンなし）でお願いします。
---
【ユーザーのリクエスト】
${this.appContext.request.inputText}

【プラン進捗】
${planSummary}
    `.trim();

    const raw = await ipcClient.askLLMTool({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'これまでの流れを踏まえて、結論・まとめを教えてください。',
        },
      ],
      requestId: uuid(),
    });

    // プレーンテキスト抽出 & フォールバック
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (raw && typeof raw.content === 'string') {
      return raw.content.trim();
    }
    console.warn('[Greeter] Unexpected summary response:', raw);
    return JSON.stringify(raw ?? {}).trim();
  }
}
