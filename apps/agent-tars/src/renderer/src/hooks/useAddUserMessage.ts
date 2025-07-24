import {
  InputFile,
  InputFileType,
  MessageRole,
  MessageType,
} from '@vendor/chat-ui';
import { useAppChat } from './useAppChat';
import { useCallback } from 'react';

export function useAddUserMessage() {
  const { addMessage } = useAppChat();

  const addUserMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      // まずはテキスト
      await addMessage(
        {
          type: MessageType.PlainText,
          content: inputText,
          role: MessageRole.User,
          timestamp: Date.now(),
        },
        {
          shouldSyncStorage: true,
        },
      );

      // 画像ファイルは content を空にして履歴上に表示しない
      for (const file of inputFiles) {
        const normalizedFile =
          file.type === InputFileType.Image
            ? { ...file, content: '' }
            : { ...file, content: '' };

        await addMessage(
          {
            role: MessageRole.User,
            type: MessageType.File,
            content: normalizedFile,
            isFinal: true,
            timestamp: Date.now(),
          },
          {
            shouldSyncStorage: true,
          },
        );
      }
    },
    [addMessage],
  );

  return addUserMessage;
}
