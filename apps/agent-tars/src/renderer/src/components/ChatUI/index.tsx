// apps/agent-tars/src/renderer/src/components/ChatUI/index.tsx

import { ChatUI as BaseChatUI, InputFile, MessageRole } from '@vendor/chat-ui';
import './index.scss';
import { MenuHeader } from './MenuHeader';
import { isReportHtmlMode, STORAGE_DB_NAME } from '@renderer/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAddUserMessage } from '@renderer/hooks/useAddUserMessage';
import { useAgentFlow } from '@renderer/hooks/useAgentFlow';
import { renderMessageUI } from './renderMessageUI';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';
import { useThemeMode } from '@renderer/hooks/useThemeMode';
import { useAtom, useAtomValue } from 'jotai';
import {
  currentAgentFlowIdRefAtom,
  eventsAtom,
  globalEventEmitter,
  planTasksAtom,
  agentStatusTipAtom,
  isAgentRunningAtom, // ★ 追加
} from '@renderer/state/chat';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';
import { StatusBar } from './StatusBar';

export function OpenAgentChatUI() {
  const [isInitialized, setIsInitialized] = useState(false);

  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [, setPlanTasks] = useAtom(planTasksAtom);
  const [agentStatusTip, setAgentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const isRunning = useAtomValue(isAgentRunningAtom); // ★ Atomで状態取得

  const { currentSessionId, updateChatSession } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        await addUserMessage(inputText, inputFiles);

        // 初回のみセッションタイトル自動生成
        if (messages.length === 0 && currentSessionId) {
          const title =
            inputText.trim().slice(0, 24) +
            (inputText.length > 24 ? '...' : '');
          await updateChatSession(currentSessionId, { name: title });
        }

        await launchAgentFlow(inputText, inputFiles);
      } catch (e) {
        console.error(e);
        // フォールバックで UI 解放
        setAgentStatusTip('');
        setPlanTasks([]);
      }
    },
    [
      addUserMessage,
      launchAgentFlow,
      messages,
      currentSessionId,
      updateChatSession,
      setAgentStatusTip,
      setPlanTasks,
    ],
  );

  // 履歴初期化
  useEffect(() => {
    (async () => {
      setIsInitialized(false);
      const msgs =
        (window as any).__OMEGA_REPORT_DATA__?.messages ??
        (await initMessages());
      setMessages(msgs || []);
      setEvents(extractHistoryEvents(msgs as MessageItem[]));
      setIsInitialized(true);
    })();
  }, [currentSessionId]);

  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

  return (
    <BaseChatUI
      styles={{
        container: { height: '100vh', width: '100%' },
        inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
      }}
      disableInput={isReportHtmlMode || isRunning} // ★ 実行中は入力禁止
      ref={chatUIRef}
      features={{
        clearConversationHistory: false,
        uploadFiles: false,
        conversationSelector: true,
        autoSelectLastConversation: true,
      }}
      customMessageRender={(msg) =>
        renderMessageUI({ message: msg as MessageItem })
      }
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      onMessageAbort={() => {
        // ユーザー中断
        setPlanTasks([]);
        setAgentStatusTip('');
        if (currentAgentFlowIdRef.current) {
          globalEventEmitter.emit(currentAgentFlowIdRef.current, {
            type: 'terminate',
          });
        }
      }}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            {isRunning && (
              <div style={{ padding: '0.5rem', textAlign: 'center' }}>
                <StatusBar />
              </div>
            )}
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
          </>
        ),
      }}
      classNames={{ messageList: 'scrollbar' }}
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isRunning ? '思考中…お待ちください' : 'メッセージを入力…'
      }
    />
  );
}
