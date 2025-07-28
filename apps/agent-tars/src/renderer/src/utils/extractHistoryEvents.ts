// apps/agent-tars/src/renderer/utils/extractHistoryEvents.ts
import {
  MessageContentType,
  MessageItem,
  MessageRole,
  MessageType,
} from '@renderer/type/chatMessage';
import { EventItem } from '@renderer/type/event';

/**
 * 履歴メッセージから EventItem[] を生成（ユーザー発言＋OmegaAgentイベントを統合）
 */
export function extractHistoryEvents(messages: MessageItem[]): EventItem[] {
  const seen = new Set<string>();
  const results: EventItem[] = [];

  for (const message of messages) {
    if (
      message.type === MessageType.OmegaAgent &&
      (message.content as MessageContentType['omega-agent']).events
    ) {
      const events = (message.content as MessageContentType['omega-agent'])
        .events;
      for (const e of events) {
        const key = `${e.id}-${e.role}-${e.type || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(e);
        }
      }
    } else if (message.role === MessageRole.User) {
      const key = `${message.timestamp}-${message.role}-${message.content}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: `${message.timestamp}`,
          role: MessageRole.User,
          type: 'chat-text',
          content: message.content,
        });
      }
    }
  }

  return results;
}
