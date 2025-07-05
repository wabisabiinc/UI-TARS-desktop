import { MarkdownRenderer } from '@vendor/chat-ui';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';
import { AgentFlowMessage } from '../AgentFlowMessage';
import { MessageRole } from '@vendor/chat-ui';
import { extractBulletList } from '../../utils/listUtils';
import { StepCard } from './StepCard';

export function renderMessageUI({ message }: { message: MessageItem }) {
  // OmegaAgent のプランUI
  if (message.type === MessageType.OmegaAgent) {
    return <AgentFlowMessage message={message} />;
  }
  // Assistant のテキスト応答のみ
  if (message.role !== MessageRole.Assistant) {
    return null;
  }

  const text = message.content as string;
  // 箇条書きリストを見つけたら StepCard で描画
  const bullets = extractBulletList(text);
  if (bullets.length > 1) {
    return <StepCard steps={bullets} />;
  }

  // それ以外は普通の Markdown
  return <MarkdownRenderer content={text} smooth={!message.isFinal} />;
}
