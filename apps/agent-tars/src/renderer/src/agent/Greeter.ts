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
  async run() {
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
      console.error(e);
      throw e;
    }
  }

  /**
   * 全ステップ完了後の最終まとめを取得する
   */
  public async generateFinalSummary(): Promise<string> {
    // 最終まとめは必ず「テキストのみ」で返すようプロンプトを厳格化
    const systemPrompt = `
あなたは優秀なアシスタントです。以下のユーザーのリクエストに対し、
もっともわかりやすい「最終回答」を日本語でコンパクトに（200字以内で）提供してください。
- JSONやマークダウンや番号リスト形式は禁止です
- 必ず文章のみ（日本語のテキストだけ）で答えてください
    `.trim();

    const userText = `ユーザーのリクエスト: ${this.appContext.request.inputText}`;

    // askLLMToolは通常のmessages形式で投げる
    const raw = await ipcClient.askLLMTool({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      requestId: uuid(),
    });

    // 返却値（string or { content: string } 形式に両対応）
    let content: string | undefined =
      typeof raw === 'string' ? raw : raw?.content;

    // contentが空 or JSONっぽい場合はエラーとして出す
    if (
      !content ||
      /^\s*\{/.test(content.trim()) ||
      /^\s*\[/.test(content.trim()) ||
      /("plan"|^\s*\{.*\bplan\b.*\})/i.test(content)
    ) {
      return '（最終まとめの出力に失敗しました。要約指示にplan JSONが返ってきました）';
    }
    return content.trim();
  }
}
