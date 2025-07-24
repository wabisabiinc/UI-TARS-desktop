import { useCallback } from 'react';
import { useAppChat } from './useAppChat';
import {
  InputFile,
  InputFileType,
  MessageRole,
  MessageType,
} from '@vendor/chat-ui';

/**
 * ユーザー入力メッセージを履歴に追加します。
 * ChatGPT 方式に合わせ、テキストも画像も履歴に残します。
 */
export function useAddUserMessage() {
  const { addMessage } = useAppChat();

  const addUserMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      // 1) テキストメッセージ
      await addMessage(
        {
          type: MessageType.PlainText,
          content: inputText,
          role: MessageRole.User,
          timestamp: Date.now(),
        },
        { shouldSyncStorage: true },
      );

      // 2) 画像ファイルメッセージ
      for (const file of inputFiles) {
        if (file.type === InputFileType.Image) {
          // そのままファイルオブジェクトを content に渡す
          await addMessage(
            {
              type: MessageType.File,
              content: file,
              role: MessageRole.User,
              isFinal: true,
              timestamp: Date.now(),
            },
            { shouldSyncStorage: true },
          );
        }
      }
    },
    [addMessage],
  );

  return addUserMessage;
}
