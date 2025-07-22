// apps/agent-tars/src/renderer/src/components/ChatUI/renderMessageUI.tsx

import { MarkdownRenderer } from '@vendor/chat-ui';
import { MessageItem } from '@renderer/type/chatMessage';

export function renderMessageUI({ message }: { message: MessageItem }) {
  // content が文字列かオブジェクトかを判定し、
  // オブジェクトは JSON 文字列に変換して表示
  const raw =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

  return <MarkdownRenderer content={raw} smooth={!message.isFinal} />;
}
