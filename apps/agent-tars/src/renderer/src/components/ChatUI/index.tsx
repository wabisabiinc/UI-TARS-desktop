// apps/agent-tars/src/renderer/src/components/ChatUI/index.tsx
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
import { PlanTaskStatus } from './PlanTaskStatus';
import { StatusBar } from './StatusBar';
import { AgentFlowMessage } from '../AgentFlowMessage';

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const { currentSessionId } = useChatSessions({ appId: DEFAULT_APP_ID });

  // プラン生成の完了／失敗で送信中フラグを戻す
  useEffect(() => {
    if (
      planTasks.length > 0 ||
      ['No plan', 'Failed', 'Error', 'Completed'].includes(agentStatusTip)
    ) {
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip]);

  // onMessageSend: ここだけ元に戻します
  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        // 入力欄ロック
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = true;
          inputEle.style.cursor = 'not-allowed';
        }
        setIsSending(true);

        // 1) ユーザー発言を UI に追加
        await addUserMessage(inputText, inputFiles);

        // 2) AgentFlow を起動（AgentFlow → Aware → Executor の一連処理）
        await launchAgentFlow(inputText, inputFiles);
      } finally {
        // アンロック
        setIsSending(false);
        const inputEle2 = chatUIRef.current?.getInputTextArea?.();
        if (inputEle2) {
          inputEle2.disabled = false;
          inputEle2.style.cursor = 'auto';
        }
      }
    },
    [addUserMessage, launchAgentFlow],
  );

  // 初期メッセージの読み込みと履歴イベント設定
  useEffect(() => {
    (async () => {
      setIsInitialized(false);
      const msgs =
        window.__OMEGA_REPORT_DATA__?.messages ?? (await initMessages());
      setMessages(msgs || []);
      setEvents(extractHistoryEvents(msgs as MessageItem[]));
      setIsInitialized(true);
    })();
  }, [currentSessionId]);

  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

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
      disableInput={isReportHtmlMode}
      ref={chatUIRef}
      customMessageRender={(message) => {
        const msg = message as MessageItem;
        if (msg.type === MessageType.OmegaAgent) {
          return <AgentFlowMessage message={msg} />;
        }
        if (msg.role === 'assistant') {
          return renderMessageUI({ message: msg });
        }
        return undefined;
      }}
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      features={{ clearConversationHistory: true, uploadFiles: false }}
      onMessageAbort={() => {
        // ユーザーが中断したとき
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
      onClearConversationHistory={() => setEvents([])}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            <StatusBar />
            <PlanTaskStatus />
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
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
