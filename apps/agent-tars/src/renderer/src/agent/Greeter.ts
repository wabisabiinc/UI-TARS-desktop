import { v4 as uuid } from 'uuid';
import { MessageType } from '@vendor/chat-ui';
import { Message } from '@agent-infra/shared';
import { ipcClient, onMainStreamEvent } from '@renderer/api';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { globalEventEmitter } from '@renderer/state/chat';

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
    const systemPrompt = `
あなたは優秀なアシスタントです。以下のユーザーのリクエストに対し、
もっともわかりやすい「最終回答」を日本語でコンパクトに（200字以内で）提供してください。
`;

    // LLM呼び出し
    const raw = await ipcClient.askLLMTool({
      model: 'gpt-4o',
      messages: [
        Message.systemMessage(systemPrompt),
        Message.userMessage(
          `ユーザーのリクエスト: ${this.appContext.request.inputText}`,
        ),
      ],
      requestId: uuid(),
    });

    // { content: string }型なので、raw.contentを取り出す
    // さらにcontentがJSONのとき（AI返答仕様変更時）もケア
    let summary: string = '';
    if (typeof raw === 'string') {
      summary = raw.trim();
    } else if (raw && typeof raw.content === 'string') {
      try {
        // contentが{"content": "xxx"}やJSONになっている場合をケア
        const maybeObj = JSON.parse(raw.content);
        if (maybeObj && typeof maybeObj === 'object' && maybeObj.content) {
          summary = maybeObj.content.trim();
        } else {
          summary = raw.content.trim();
        }
      } catch {
        // パースできない場合はそのまま
        summary = raw.content.trim();
      }
    } else {
      summary = JSON.stringify(raw);
    }

    // undefined/空白の場合はUIにそれっぽく出す
    if (!summary || summary === 'undefined') {
      return '(最終まとめの出力に失敗しました)';
    }
    return summary;
  }
}
