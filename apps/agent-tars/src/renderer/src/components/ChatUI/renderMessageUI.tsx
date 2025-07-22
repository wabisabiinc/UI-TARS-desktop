\// apps/agent-tars/src/renderer/src/components/ChatUI/renderMessageUI.tsx
import { MarkdownRenderer } from '@vendor/chat-ui';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';

/**
 * Ωメッセージは画面に出さない（StatusBar等で可視化しているため）
 * どうしてもデバッグで見たい場合はここで折りたたみUIを実装する。
 */
export function renderMessageUI({ message }: { message: MessageItem }) {
  if (message.type === MessageType.OmegaAgent) {
    return null;
  }

  const raw =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

  return <MarkdownRenderer content={raw} smooth={!message.isFinal} />;
}
