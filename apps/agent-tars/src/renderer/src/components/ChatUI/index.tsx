// ===== apps/agent-tars/src/renderer/src/components/ChatUI/index.tsx =====
import { ChatUI as BaseChatUI, InputFile } from '@vendor/chat-ui';
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
  planTasksAtom,
  agentStatusTipAtom,
  globalEventEmitter,
} from '@renderer/state/chat';
import { BeforeInputContainer } from './BeforeInputContainer';
import { AgentStatusTip } from './AgentStatusTip';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';
import { StatusBar } from './StatusBar';
import { PlanTaskStatus } from './PlanTaskStatus';

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const chatUIRef = useRef<any>(null);
  const addUser = useAddUserMessage();
  const launch = useAgentFlow();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentRef = useAtomValue(currentAgentFlowIdRefAtom);
  const { currentSessionId } = useChatSessions({ appId: DEFAULT_APP_ID });

  useEffect(() => {
    if (
      planTasks.length > 0 ||
      ['No plan', 'Failed', 'Error', '完了'].includes(agentStatusTip)
    ) {
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip]);

  const send = useCallback(
    async (text: string, files: InputFile[]) => {
      setIsSending(true);
      await addUser(text, files);
      await launch(text, files);
      setIsSending(false);
    },
    [addUser, launch],
  );

  useEffect(() => {
    (async () => {
      const msgs =
        window.__OMEGA_REPORT_DATA__?.messages ?? (await initMessages());
      setMessages(msgs || []);
      setEvents(extractHistoryEvents(msgs as MessageItem[]));
    })();
  }, [currentSessionId]);

  if (!isReportHtmlMode && !currentSessionId) return <WelcomeScreen />;

  const renderError = () =>
    !isSending &&
    planTasks.length === 0 &&
    ['No plan', 'Failed', 'Error'].includes(agentStatusTip) ? (
      <div style={{ color: 'red', padding: 8 }}>
        プランの生成に失敗しました。もう一度お試しください。
      </div>
    ) : null;

  return (
    <BaseChatUI
      styles={{
        container: { height: '100vh', width: '100%' },
        inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
      }}
      ref={chatUIRef}
      disableInput={isReportHtmlMode}
      onMessageSend={send}
      onMessageAbort={() =>
        currentRef.current &&
        globalEventEmitter.emit(currentRef.current, { type: 'terminate' })
      }
      onClearConversationHistory={() => setEvents([])}
      customMessageRender={(m) =>
        renderMessageUI({ message: m as MessageItem })
      }
      isDark={useThemeMode().value}
      features={{ clearConversationHistory: true, uploadFiles: false }}
      storageDbName={STORAGE_DB_NAME}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            <StatusBar />
            <PlanTaskStatus />
            {messages.length === 0 && <WelcomeScreen />}
            {renderError()}
          </>
        ),
        beforeInputContainer: <BeforeInputContainer />,
      }}
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isSending
          ? 'Agent is working, please wait...'
          : 'Type your message here...'
      }
    />
  );
}
