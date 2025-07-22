// apps/agent-tars/src/renderer/src/hooks/useAppChat.ts

import { useChat } from '@vendor/chat-ui';
import { useEffect } from 'react';
import { STORAGE_DB_NAME } from '@renderer/constants';
import { MessageContentType } from '@renderer/type/chatMessage';
import { useChatSessions } from './useChatSession';
import { DEFAULT_APP_ID } from '@renderer/components/LeftSidebar';

export function useAppChat() {
  const { currentSessionId } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  const chat = useChat<MessageContentType>({
    storageDbName: STORAGE_DB_NAME,
    conversationId: currentSessionId || 'default',
  });

  // セッション切り替えごとに履歴を再ロード
  useEffect(() => {
    chat.initMessages();
  }, [currentSessionId]);

  return chat;
}
