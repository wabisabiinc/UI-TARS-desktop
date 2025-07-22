// apps/agent-tars/src/renderer/src/components/ChatUI/renderMessageUI.tsx
import { MarkdownRenderer } from '@vendor/chat-ui';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';

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
