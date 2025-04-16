// /apps/ui-tars/src/renderer/src/db/chat.ts
import { get, set, del, createStore } from 'idb-keyval';
import { Message } from '@ui-tars/shared/types';
import { DBName } from './session';

export interface ChatMessage extends Message {
  id: string;
  sessionId: string;
  timestamp: number;
}

export interface ChatMetaInfo {
  [key: string]: any;
}

const chatStore = createStore(DBName, 'chats');

export class ChatManager {
  // 创建新消息
  async createSessionMessages(sessionId: string, message: Message) {
    const messages = [message];
    await set(sessionId, messages, chatStore);
    return messages;
  }

  async updateSessionMessages(sessionId: string, messages: Message[]) {
    await set(sessionId, messages, chatStore);

    return messages;
  }

  // 获取会话的所有消息
  async getSessionMessages(sessionId: string) {
    return get<Message[]>(sessionId, chatStore);
  }

  // 删除会话相关的所有消息
  async deleteSessionMessages(sessionId: string) {
    await del(sessionId, chatStore);

    return true;
  }
}

export const chatManager = new ChatManager();
