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

declare global {
  interface Window {
    __OMEGA_REPORT_DATA__?: {
      messages: MessageItem[];
      artifacts: {
        [key: string]: {
          content: string;
        };
      };
    };
  }
}

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<{
    getInputTextArea: () => HTMLTextAreaElement | null;
    triggerCommand: (command: string) => void;
    focusInput: () => void;
  }>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [events] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const { currentSessionId } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  // planTasksの変化、またはagentStatusTipの変化でThinking解除
  useEffect(() => {
    if (
      isSending &&
      ((planTasks && Array.isArray(planTasks) && planTasks.length > 0) ||
        agentStatusTip === 'No plan' ||
        agentStatusTip === 'Failed' ||
        agentStatusTip === 'Error' ||
        agentStatusTip === '完了')
    ) {
      setIsSending(false);
      console.log('[DEBUG] Thinkingを解除しました:', planTasks, agentStatusTip);
    }
    // デバッグ
    console.log(
      '[ChatUI] UIで受け取ったplanTasks:',
      planTasks,
      'agentStatusTip:',
      agentStatusTip,
    );
  }, [planTasks, agentStatusTip, isSending]);

  useEffect(() => {
    console.log('[ChatUI] UIで受け取ったevents:', events);
  }, [events]);

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        const inputEle = chatUIRef.current?.getInputTextArea();
        if (inputEle) {
          inputEle.disabled = true;
          inputEle.style.cursor = 'not-allowed';
        }
        setIsSending(true);
        await addUserMessage(inputText, inputFiles);
        await launchAgentFlow(inputText, inputFiles);
        // ★ここでsetIsSending(false)しない（planTasks反映で解除するため）
      } catch (e) {
        setIsSending(false); // 例外時は強制解除
      } finally {
        const inputEle = chatUIRef.current?.getInputTextArea();
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

  // ★★ ここから「planTasks」の表示部分を追加！★★
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
              {/* 必要ならtask.statusも表示可能 */}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  // エラー表示例（任意）
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
    <>
      <BaseChatUI
        styles={{
          container: {
            height: 'calc(100vh)',
            width: '100%',
          },
          inputContainer: {
            display: isReportHtmlMode ? 'none' : 'flex',
          },
        }}
        disableInput={isReportHtmlMode}
        ref={chatUIRef}
        customMessageRender={(message) => {
          return renderMessageUI({
            message: message as unknown as MessageItem,
          });
        }}
        isDark={isDarkMode.value}
        onMessageSend={sendMessage}
        storageDbName={STORAGE_DB_NAME}
        features={{
          clearConversationHistory: true,
          uploadFiles: false,
        }}
        onMessageAbort={() => {
          setIsSending(false);
          const inputEle = chatUIRef.current?.getInputTextArea();
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
              {renderPlanTasks()} {/* ←ここにPlanを表示 */}
              {renderError()} {/* ←ここにエラー表示（任意） */}
            </>
          ),
          beforeInputContainer: <BeforeInputContainer />,
          customFeatures: (
            <div className="flex gap-2">
              {isSending ? <AgentStatusTip /> : null}
            </div>
          ),
        }}
        classNames={{
          messageList: 'scrollbar',
        }}
        conversationId={currentSessionId || 'default'}
        inputPlaceholder={
          isSending
            ? 'Agent is working, please wait...'
            : 'Type your message here...'
        }
      />
    </>
  );
}
