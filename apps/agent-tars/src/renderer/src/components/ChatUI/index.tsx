import { ChatUI as BaseChatUI, InputFile } from '@vendor/chat-ui';
import './index.scss';
import { MenuHeader } from './MenuHeader';
import { isReportHtmlMode, STORAGE_DB_NAME } from '@renderer/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAddUserMessage } from '@renderer/hooks/useAddUserMessage';
import { useAgentFlow } from '@renderer/hooks/useAgentFlow';
import { renderMessageUI } from './renderMessageUI';
import { MessageItem } from '@renderer/type/chatMessage';
import { useThemeMode } from '@renderer/hooks/useThemeMode';
import { useAtom, useAtomValue } from 'jotai';
import {
  currentAgentFlowIdRefAtom,
  eventsAtom,
  globalEventEmitter,
  planTasksAtom,
  agentStatusTipAtom,
} from '@renderer/state/chat';
import { BeforeInputContainer } from './BeforeInputContainer';
import { AgentStatusTip } from './AgentStatusTip';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [events] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const { currentSessionId } = useChatSessions({ appId: DEFAULT_APP_ID });

  // ❌ planTasksの副作用的な再上書き（extractEventStreamUIMeta）は不要！
  // useEffect(() => {
  //   const { planTasks } = extractEventStreamUIMeta(events);
  //   setPlanTasks((prev) => {
  //     if (JSON.stringify(prev) !== JSON.stringify(planTasks)) {
  //       return planTasks;
  //     }
  //     return prev;
  //   });
  // }, [events, setPlanTasks]);

  useEffect(() => {
    if (
      isSending &&
      ((planTasks && planTasks.length > 0) ||
        agentStatusTip === 'No plan' ||
        agentStatusTip === 'Failed' ||
        agentStatusTip === 'Error' ||
        agentStatusTip === '完了')
    ) {
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip, isSending]);

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = true;
          inputEle.style.cursor = 'not-allowed';
        }
        setIsSending(true);
        await addUserMessage(inputText, inputFiles);
        await launchAgentFlow(inputText, inputFiles);
      } catch (e) {
        setIsSending(false);
      } finally {
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = false;
          inputEle.style.cursor = 'auto';
        }
      }
    },
    [addUserMessage, launchAgentFlow],
  );

  useEffect(() => {
    async function init() {
      setIsInitialized(false);
      const messages =
        window.__OMEGA_REPORT_DATA__?.messages ?? (await initMessages());
      setMessages(messages || []);
      const events = extractHistoryEvents(messages as unknown as MessageItem[]);
      setEvents(events);
      setIsInitialized(true);
    }
    init();
  }, [currentSessionId]);

  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

  // Planの表示
  const renderPlanTasks = () => {
    if (!planTasks || planTasks.length === 0) return null;
    return (
      <div
        style={{
          background: '#f6f6fa',
          margin: '8px 0',
          padding: '12px',
          borderRadius: 8,
        }}
      >
        <b>Plan:</b>
        <ol style={{ margin: '8px 0 0 24px', padding: 0 }}>
          {planTasks.map((task, idx) => (
            <li key={task.id || idx}>
              <span>{task.title || '(no title)'}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  };

  // エラー時の表示
  const renderError = () => {
    if (
      !isSending &&
      planTasks.length === 0 &&
      (agentStatusTip === 'No plan' ||
        agentStatusTip === 'Failed' ||
        agentStatusTip === 'Error')
    ) {
      return (
        <div style={{ color: 'red', padding: 8 }}>
          プランの生成に失敗しました。もう一度お試しください。
        </div>
      );
    }
    return null;
  };

  return (
    <BaseChatUI
      styles={{
        container: { height: 'calc(100vh)', width: '100%' },
        inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
      }}
      disableInput={isReportHtmlMode}
      ref={chatUIRef}
      customMessageRender={(message) =>
        renderMessageUI({ message: message as unknown as MessageItem })
      }
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      features={{ clearConversationHistory: true, uploadFiles: false }}
      onMessageAbort={() => {
        setIsSending(false);
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = false;
          inputEle.style.cursor = 'auto';
        }
        if (currentAgentFlowIdRef.current) {
          globalEventEmitter.emit(currentAgentFlowIdRef.current, {
            type: 'terminate',
          });
        }
      }}
      onClearConversationHistory={() => {
        setEvents([]);
      }}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
            {renderPlanTasks()}
            {renderError()}
          </>
        ),
        beforeInputContainer: <BeforeInputContainer />,
        customFeatures: (
          <div className="flex gap-2">
            {isSending ? <AgentStatusTip /> : null}
          </div>
        ),
      }}
      classNames={{ messageList: 'scrollbar' }}
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isSending
          ? 'Agent is working, please wait...'
          : 'Type your message here...'
      }
    />
  );
}
