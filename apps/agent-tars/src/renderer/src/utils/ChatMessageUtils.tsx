// apps/agent-tars/src/renderer/src/utils/ChatMessageUtils.tsx
import { MessageRole } from '@vendor/chat-ui';
import {
  MessageItem,
  MessageType,
  OmegaAgentData,
} from '@renderer/type/chatMessage';

export class ChatMessageUtil {
  static userMessage(
    content: string,
    type = MessageType.PlainText,
  ): MessageItem {
    return {
      role: MessageRole.User,
      content,
      type,
      timestamp: Date.now(),
    };
  }

  /**
   * Ωメッセージは text を描画しない。events 等は content(=OmegaAgentData)に保持して
   * UI 側で必要なら個別描画する。
   */
  static assistantOmegaMessage(
    data: OmegaAgentData, // { events: EventItem[] } など
    type = MessageType.OmegaAgent,
  ): MessageItem {
    return {
      role: MessageRole.Assistant,
      content: data, // ★ JSONを文字列化しない
      type,
      timestamp: Date.now(),
      showCopyButton: false,
    };
  }

  static assistantTextMessage(content: string): MessageItem {
    return {
      role: MessageRole.Assistant,
      content,
      type: MessageType.PlainText,
      timestamp: Date.now(),
      showCopyButton: false,
    };
  }

  static assistantThinkMessage(
    content: string,
    type = MessageType.PlainText,
  ): MessageItem {
    return {
      role: MessageRole.Assistant,
      content,
      type,
      timestamp: Date.now(),
      showCopyButton: false,
    };
  }
}
